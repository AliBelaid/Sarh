import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { StorageService } from '../storage/storage.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SijilliRequestUser } from '../auth/types';
import { DigitalIdNumberService } from '../citizens/digital-id-number.service';
import { NfcKeyStoreService } from '../nfc/nfc-key-store.service';
import { sha256OfStorageObject } from '../common/utils/sha256';
import { SsiService } from '../ssi/ssi.service';
import { IssueCardDto } from './dto/issue-card.dto';
import { FreezeCardDto, ReissueCardDto, RevokeCardDto } from './dto/card-action.dto';
import { ListDigitalIdsQuery } from './dto/list-cards.dto';

const CARD_SELECT = `
  id, citizen_id, digital_id_number, card_serial,
  nfc_uid, nfc_signature_key_id,
  did, did_doc, wallet_endpoint,
  issued_at, issued_by_officer_id, expires_at,
  status, revoked_at, revoked_reason,
  photo_hash, data_hash,
  last_nfc_counter, last_nfc_tap_at,
  created_at, updated_at
`;

const PHOTO_SHA256_RE = /^[0-9a-fA-F]{64}$/;

export interface IssueCardResult {
  card: Record<string, unknown>;
  // The plaintext NFC keys are returned exactly once — the issuer station
  // writes them to the chip and never stores them. After this response,
  // the keys live only inside nfc_card_secrets, encrypted with KMS.
  nfc_keys: {
    meta_read_key_hex: string;
    sdm_file_read_key_hex: string;
    kms_key_id: string;
  };
  // The URL template that should be encoded into NDEF record 2 of the
  // chip. The chip fills in the {p} and {c} placeholders on every tap.
  sun_url_template: string;
}

@Injectable()
export class DigitalIdCardsService {
  private readonly logger = new Logger(DigitalIdCardsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly storage: StorageService,
    private readonly numbers: DigitalIdNumberService,
    private readonly keyStore: NfcKeyStoreService,
    private readonly ssi: SsiService,
  ) {}

  // ----------------------------------------------------------------------
  // LIST — cursor-paginated, optionally filtered by status / id prefix.
  // The joined citizen lets the admin UI render full Arabic names without
  // an extra round-trip per row.
  // ----------------------------------------------------------------------
  async list(q: ListDigitalIdsQuery, actor: SijilliRequestUser) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    let query = this.supabase.admin
      .from('digital_id_cards')
      .select(
        `${CARD_SELECT}, citizen:citizens(id, first_name_ar, father_name_ar, family_name_ar, region_id, phone)`,
      )
      .order('issued_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(q.limit + 1);

    if (q.status) query = query.eq('status', q.status);
    if (q.cursor) query = query.lt('issued_at', q.cursor);
    if (q.q && q.q.trim().length >= 2) {
      const safe = q.q.replace(/[%_]/g, '\\$&').trim();
      query = query.ilike('digital_id_number', `%${safe}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw SijilliErrors.upstream(`Failed to list digital ID cards: ${error.message}`);
    }

    const items = (data ?? []) as Array<Record<string, unknown>>;
    let next_cursor: string | null = null;
    if (items.length > q.limit) {
      const overflow = items.pop()!;
      next_cursor = (overflow.issued_at as string) ?? null;
    }
    return { items, next_cursor };
  }

  // ----------------------------------------------------------------------
  // ISSUE — full new-card flow.
  // ----------------------------------------------------------------------
  async issue(dto: IssueCardDto, actor: SijilliRequestUser): Promise<IssueCardResult> {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    // 1. Confirm the citizen exists and is active.
    const citizen = await this.supabase.admin
      .from('citizens')
      .select('id, region_id, is_active, photo_path')
      .eq('id', dto.citizen_id)
      .maybeSingle();
    if (citizen.error) throw SijilliErrors.upstream(citizen.error.message);
    if (!citizen.data || !citizen.data.is_active) throw SijilliErrors.notFound('المواطن');

    // 2. Refuse if the citizen already has an active card — caller should
    //    use /reissue instead.
    const existing = await this.supabase.admin
      .from('digital_id_cards')
      .select('id')
      .eq('citizen_id', dto.citizen_id)
      .eq('status', 'active')
      .maybeSingle();
    if (existing.data) {
      throw SijilliErrors.conflict(
        'يوجد بطاقة فعّالة لهذا المواطن. استخدم إعادة الإصدار بدلاً من إصدار جديد.',
        'Citizen already has an active card; use /reissue.',
      );
    }

    // 3. Resolve the photo hash.
    const photoHash = await this.resolvePhotoHash(dto, citizen.data.photo_path ?? null);

    // 4. Allocate the digital ID number (real Luhn check digit).
    const digitalIdNumber = await this.numbers.next(
      dto.region_code,
      dto.year ?? new Date().getFullYear(),
    );

    // 5. Insert the card row in 'active' state.
    const expiresAt = addYears(new Date(), dto.validity_years ?? 5);
    const cardSerial = `LY-${randomHexUpper(12)}`;

    const insert = await this.supabase.admin
      .from('digital_id_cards')
      .insert({
        citizen_id: dto.citizen_id,
        digital_id_number: digitalIdNumber,
        card_serial: cardSerial,
        photo_hash: photoHash,
        issued_by_officer_id: actor.officer_id,
        expires_at: expiresAt.toISOString(),
        status: 'active',
      })
      .select(CARD_SELECT)
      .single();

    if (insert.error || !insert.data) {
      if (insert.error?.code === '23505') {
        throw SijilliErrors.conflict(
          'تعارض في رقم البطاقة أو الرقم الرقمي.',
          'Conflict on card_serial or digital_id_number.',
        );
      }
      throw SijilliErrors.upstream(`Failed to insert card: ${insert.error?.message}`);
    }

    // 6. Mint and persist the NFC keys (returned once to the caller).
    const keys = await this.keyStore.mintForCard(insert.data.id as string);

    // 7. History entry.
    await this.supabase.admin.from('id_issuance_history').insert({
      citizen_id: dto.citizen_id,
      card_id: insert.data.id,
      action: 'issued',
      reason: null,
      officer_id: actor.officer_id,
    });

    // 8. Issue the DigitalId VC. Failure here doesn't block card issuance —
    // the workflow can retry later — but we log it for ops visibility.
    const card = await this.attachVc(insert.data.id as string, insert.data);

    return {
      card,
      nfc_keys: {
        meta_read_key_hex: keys.metaReadKey.toString('hex').toUpperCase(),
        sdm_file_read_key_hex: keys.sdmFileReadKey.toString('hex').toUpperCase(),
        kms_key_id: 'local:v1',
      },
      sun_url_template:
        (process.env.NFC_SUN_BASE_URL ?? 'https://verify.sijilli.ly/v') + '?p={picc}&c={cmac}',
    };
  }

  // ----------------------------------------------------------------------
  // FREEZE — reversible. Card stops verifying tap responses but keys are kept.
  // ----------------------------------------------------------------------
  async freeze(cardId: string, dto: FreezeCardDto, actor: SijilliRequestUser) {
    return this.transition(cardId, 'frozen', dto.reason, actor, 'frozen');
  }

  // ----------------------------------------------------------------------
  // REVOKE — terminal. Card secrets are kept (for audit) but status is final.
  // ----------------------------------------------------------------------
  async revoke(cardId: string, dto: RevokeCardDto, actor: SijilliRequestUser) {
    return this.transition(cardId, 'revoked', dto.reason, actor, 'revoked');
  }

  // ----------------------------------------------------------------------
  // REISSUE — revoke the existing card and issue a new one for the same
  // citizen. By default keeps the same digital_id_number (number is the
  // identity, the card is the credential).
  // ----------------------------------------------------------------------
  async reissue(cardId: string, dto: ReissueCardDto, actor: SijilliRequestUser): Promise<IssueCardResult> {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    const old = await this.supabase.admin
      .from('digital_id_cards')
      .select('id, citizen_id, digital_id_number, photo_hash, expires_at, status')
      .eq('id', cardId)
      .maybeSingle();
    if (old.error) throw SijilliErrors.upstream(old.error.message);
    if (!old.data) throw SijilliErrors.notFound('البطاقة');

    // Revoke the old card.
    await this.transition(cardId, 'revoked', `إعادة إصدار: ${dto.reason}`, actor, 'revoked');

    // Issue a new one. Reuse the digital_id_number unless asked not to.
    const region = parseRegionFromDigitalId(old.data.digital_id_number as string);
    const year = new Date().getFullYear();
    const digitalIdNumber =
      dto.keep_digital_id_number === false
        ? await this.numbers.next(region, year)
        : (old.data.digital_id_number as string);

    const cardSerial = `LY-${randomHexUpper(12)}`;
    const expiresAt = addYears(new Date(), 5);

    const insert = await this.supabase.admin
      .from('digital_id_cards')
      .insert({
        citizen_id: old.data.citizen_id,
        digital_id_number: digitalIdNumber,
        card_serial: cardSerial,
        photo_hash: old.data.photo_hash,
        issued_by_officer_id: actor.officer_id,
        expires_at: expiresAt.toISOString(),
        status: 'active',
      })
      .select(CARD_SELECT)
      .single();

    if (insert.error || !insert.data) {
      throw SijilliErrors.upstream(`Failed to insert reissued card: ${insert.error?.message}`);
    }

    const keys = await this.keyStore.mintForCard(insert.data.id as string);

    await this.supabase.admin.from('id_issuance_history').insert({
      citizen_id: old.data.citizen_id,
      card_id: insert.data.id,
      action: 're-issued',
      reason: dto.reason,
      officer_id: actor.officer_id,
    });

    const card = await this.attachVc(insert.data.id as string, insert.data);

    return {
      card,
      nfc_keys: {
        meta_read_key_hex: keys.metaReadKey.toString('hex').toUpperCase(),
        sdm_file_read_key_hex: keys.sdmFileReadKey.toString('hex').toUpperCase(),
        kms_key_id: 'local:v1',
      },
      sun_url_template:
        (process.env.NFC_SUN_BASE_URL ?? 'https://verify.sijilli.ly/v') + '?p={picc}&c={cmac}',
    };
  }

  // Issue the DigitalId VC for a freshly-active card and stamp the
  // wallet's DID onto the card row. Errors are logged, not thrown — VC
  // issuance is best-effort and recoverable via /digital-id-cards/:id/vc/retry
  // (Phase 12). Returns the (possibly updated) card row.
  private async attachVc(
    cardId: string,
    initialCard: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const vc = await this.ssi.issueDigitalIdVc({ card_id: cardId });
      const updated = await this.supabase.admin
        .from('digital_id_cards')
        .update({ did: vc.did })
        .eq('id', cardId)
        .select(CARD_SELECT)
        .single();
      if (updated.error || !updated.data) {
        this.logger.warn(`Failed to stamp DID on card ${cardId}: ${updated.error?.message}`);
        return initialCard;
      }
      return updated.data;
    } catch (err) {
      this.logger.error(`VC issuance failed for card ${cardId}: ${(err as Error).message}`);
      return initialCard;
    }
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private async transition(
    cardId: string,
    nextStatus: 'frozen' | 'revoked',
    reason: string,
    actor: SijilliRequestUser,
    historyAction: string,
  ) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    const before = await this.supabase.admin
      .from('digital_id_cards')
      .select('id, citizen_id, status')
      .eq('id', cardId)
      .maybeSingle();
    if (before.error) throw SijilliErrors.upstream(before.error.message);
    if (!before.data) throw SijilliErrors.notFound('البطاقة');
    if (before.data.status === 'revoked') {
      throw SijilliErrors.conflict(
        'البطاقة مُلغاة بالفعل ولا يمكن تعديل حالتها.',
        'Card is already revoked.',
      );
    }
    if (nextStatus === 'frozen' && before.data.status === 'frozen') {
      throw SijilliErrors.conflict('البطاقة مجمّدة بالفعل.', 'Card is already frozen.');
    }

    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'revoked') {
      patch.revoked_at = new Date().toISOString();
      patch.revoked_reason = reason;
    }

    const updated = await this.supabase.admin
      .from('digital_id_cards')
      .update(patch)
      .eq('id', cardId)
      .select(CARD_SELECT)
      .single();
    if (updated.error || !updated.data) {
      throw SijilliErrors.upstream(`Failed to update card: ${updated.error?.message}`);
    }

    await this.supabase.admin.from('id_issuance_history').insert({
      citizen_id: before.data.citizen_id,
      card_id: cardId,
      action: historyAction,
      reason,
      officer_id: actor.officer_id,
    });

    return updated.data;
  }

  private async resolvePhotoHash(dto: IssueCardDto, citizenPhotoPath: string | null): Promise<string> {
    if (dto.photo_sha256) {
      if (!PHOTO_SHA256_RE.test(dto.photo_sha256)) {
        throw SijilliErrors.validation(
          'بصمة الصورة غير صالحة (يجب أن تكون 64 حرفاً سادس عشر).',
          'photo_sha256 must be 64 hex characters.',
        );
      }
      return dto.photo_sha256.toLowerCase();
    }

    const path = dto.photo_path ?? citizenPhotoPath;
    if (!path) {
      throw SijilliErrors.validation(
        'يجب توفير صورة المواطن أو بصمتها قبل إصدار البطاقة.',
        'Either photo_path or photo_sha256 is required.',
      );
    }

    return sha256OfStorageObject(this.storage, dto.photo_bucket ?? 'citizen_photos', path);
  }
}

// ----------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------

function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function randomHexUpper(bytes: number): string {
  return randomBytes(bytes).toString('hex').toUpperCase();
}

// LY-RR-YYYY-SSSSSS-C → "RR"
function parseRegionFromDigitalId(id: string): string {
  const m = /^LY-([0-9]{2,4})-/.exec(id);
  if (!m) throw SijilliErrors.upstream(`Cannot parse region from digital ID: ${id}`);
  return m[1];
}
