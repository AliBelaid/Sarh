import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SijilliRequestUser } from '../auth/types';
import { NfcKeyStoreService } from './nfc-key-store.service';
import { parseSunUrl, SunDecodeError, verifySunMessage } from './crypto/sun-message';
import { EncodeCardDto } from './dto/encode-card.dto';
import { VerifySunDto, VerifySunResult } from './dto/verify-sun.dto';

@Injectable()
export class NfcService {
  private readonly logger = new Logger(NfcService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly keyStore: NfcKeyStoreService,
  ) {}

  // --------------------------------------------------------------------
  // Issuer station post-write callback. Confirms the chip was written
  // successfully and binds its UID to the card row.
  // --------------------------------------------------------------------
  async recordEncoded(dto: EncodeCardDto, actor: SijilliRequestUser) {
    if (!actor.officer_id) throw SijilliErrors.forbidden();

    const card = await this.supabase.admin
      .from('digital_id_cards')
      .select('id, citizen_id, status, nfc_uid')
      .eq('id', dto.card_id)
      .maybeSingle();
    if (card.error) throw SijilliErrors.upstream(card.error.message);
    if (!card.data) throw SijilliErrors.notFound('البطاقة');

    if (card.data.nfc_uid && card.data.nfc_uid.toLowerCase() !== dto.nfc_uid.toLowerCase()) {
      throw SijilliErrors.conflict(
        'البطاقة مرتبطة بشريحة NFC مختلفة بالفعل.',
        'Card is already bound to a different NFC UID.',
      );
    }

    const updated = await this.supabase.admin
      .from('digital_id_cards')
      .update({ nfc_uid: dto.nfc_uid.toUpperCase(), last_nfc_counter: 0 })
      .eq('id', dto.card_id)
      .select('id, citizen_id, nfc_uid, status')
      .single();
    if (updated.error || !updated.data) {
      if (updated.error?.code === '23505') {
        throw SijilliErrors.conflict(
          'هذه الشريحة مستخدمة في بطاقة أخرى.',
          'This NFC UID is already bound to another card.',
        );
      }
      throw SijilliErrors.upstream(`Failed to record encoding: ${updated.error?.message}`);
    }

    return { ok: true, card: updated.data };
  }

  // --------------------------------------------------------------------
  // SUN tap verification.
  //
  // Decisions:
  // - This endpoint is intentionally PUBLIC (no auth). Anyone holding a
  //   chip can verify it; the chip's keys are the secret, not the API.
  // - On any cryptographic failure we throw 401 with a generic message
  //   to avoid leaking which check failed.
  // - Replay protection compares the decoded counter against
  //   digital_id_cards.last_nfc_counter; equal or older is rejected.
  // --------------------------------------------------------------------
  async verifyTap(dto: VerifySunDto): Promise<VerifySunResult> {
    const { piccDataHex, cmacHex, uidHex } = this.extractParts(dto);

    // O(1) path: when the chip's SUN URL mirrors the plaintext UID via
    // `?u=<hex>`, look up the single matching card directly. The CMAC
    // check still has to pass — the UID hint only narrows candidates.
    //
    // Fallback (brute-force across active cards) is kept for the legacy
    // case where SDMUIDOffset wasn't configured at issuance time.
    let candidates: Array<{
      id: string;
      citizen_id: string;
      digital_id_number: string;
      status: string;
      nfc_uid: string | null;
      last_nfc_counter: number | null;
      expires_at: string;
    }>;

    if (uidHex) {
      const direct = await this.supabase.admin
        .from('digital_id_cards')
        .select('id, citizen_id, digital_id_number, status, nfc_uid, last_nfc_counter, expires_at')
        .eq('nfc_uid', uidHex.toUpperCase())
        .in('status', ['active', 'frozen']);
      if (direct.error) throw SijilliErrors.upstream(direct.error.message);
      candidates = (direct.data ?? []) as typeof candidates;
    } else {
      const all = await this.supabase.admin
        .from('digital_id_cards')
        .select('id, citizen_id, digital_id_number, status, nfc_uid, last_nfc_counter, expires_at')
        .in('status', ['active', 'frozen']);
      if (all.error) throw SijilliErrors.upstream(all.error.message);
      candidates = (all.data ?? []) as typeof candidates;
    }
    for (const candidate of candidates) {
      const keys = await this.keyStore.loadForCard(candidate.id as string).catch(() => null);
      if (!keys) continue;
      try {
        const decoded = verifySunMessage(keys, piccDataHex, cmacHex);

        // UID must match what we recorded at encode time.
        if (
          candidate.nfc_uid &&
          decoded.uid.toString('hex').toLowerCase() !== candidate.nfc_uid.toLowerCase()
        ) {
          continue;
        }

        if (candidate.status === 'revoked') {
          throw SijilliErrors.forbidden('البطاقة ملغاة.');
        }
        if (candidate.status === 'frozen') {
          throw SijilliErrors.forbidden('البطاقة مجمّدة.');
        }

        const expiresAt = new Date(candidate.expires_at as string);
        if (expiresAt.getTime() < Date.now()) {
          throw SijilliErrors.forbidden('البطاقة منتهية الصلاحية.');
        }

        const lastCounter = (candidate.last_nfc_counter as number | null) ?? 0;
        if (decoded.counter <= lastCounter) {
          // Replay or stale tap. Don't reveal which card it was.
          throw SijilliErrors.unauthorized();
        }

        // Record the new counter (atomic-ish — Postgres UPDATE WHERE last_nfc_counter < new).
        const upd = await this.supabase.admin
          .from('digital_id_cards')
          .update({ last_nfc_counter: decoded.counter, last_nfc_tap_at: new Date().toISOString() })
          .eq('id', candidate.id)
          .lt('last_nfc_counter', decoded.counter)
          .select('id')
          .maybeSingle();
        if (upd.error || !upd.data) {
          // Another tap raced ahead and wrote a higher counter — treat
          // this one as stale.
          throw SijilliErrors.unauthorized();
        }

        const citizen = await this.supabase.admin
          .from('citizens')
          .select('id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar, photo_path, region_id')
          .eq('id', candidate.citizen_id)
          .single();
        if (citizen.error || !citizen.data) {
          throw SijilliErrors.upstream(`Citizen lookup failed: ${citizen.error?.message}`);
        }

        return {
          card_id: candidate.id as string,
          digital_id_number: candidate.digital_id_number as string,
          status: candidate.status as string,
          counter: decoded.counter,
          citizen: {
            id: citizen.data.id as string,
            full_name_ar: [
              citizen.data.first_name_ar,
              citizen.data.father_name_ar,
              citizen.data.grandfather_name_ar,
              citizen.data.family_name_ar,
            ]
              .filter(Boolean)
              .join(' '),
            photo_path: (citizen.data.photo_path as string | null) ?? null,
            region_id: (citizen.data.region_id as number | null) ?? null,
          },
        };
      } catch (e) {
        if (e instanceof SunDecodeError) continue;
        throw e;
      }
    }

    throw SijilliErrors.unauthorized();
  }

  private extractParts(dto: VerifySunDto): { piccDataHex: string; cmacHex: string; uidHex?: string } {
    if (dto.url) {
      try {
        return parseSunUrl(dto.url);
      } catch {
        throw SijilliErrors.unauthorized();
      }
    }
    if (dto.p && dto.c) {
      return { piccDataHex: dto.p, cmacHex: dto.c, uidHex: undefined };
    }
    throw SijilliErrors.unauthorized();
  }
}
