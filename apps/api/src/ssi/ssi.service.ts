import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { sha256Hex } from '../common/utils/sha256';
import { AcaPyClient } from './aca-py.client';

// Phase 6 SsiService.
//
// When `ACA_PY_ADMIN_URL` is configured the service talks to the real
// ACA-Py issuer agent: it provisions a sub-wallet per citizen, registers
// the local DID, and uses connectionless issuance (`create-offer`) for
// the credential. The DB columns added in migration 022 carry the
// async-issuance state (cred_ex_id, state) so we can recover after
// crashes / poll until ACK.
//
// When unset, the service falls back to placeholder DIDs / cred-ids so
// the rest of the build can run end-to-end without the SSI stack —
// useful for local dev and CI where the agent is not always up. The
// placeholder ids carry recognisable prefixes so they can be migrated
// to real ones later if a citizen graduates.
//
// Spec source: PROMPTS.md Phase 6 — createWallet, issueDigitalIdVc,
// issuePropertyDeedVc, revokeVc.

const PLACEHOLDER_DID_PREFIX = 'did:placeholder:LY:';
const PLACEHOLDER_CRED_PREFIX = 'urn:placeholder:vc:';

export interface CreateWalletResult {
  wallet_id: string;            // ssi_wallets.id
  did: string;
  public_key: string;
  encrypted_seed: string | null;
  aca_py_token: string | null;  // null in placeholder mode
  is_placeholder: boolean;
}

export interface IssueDigitalIdVcInput {
  card_id: string;
}

export interface IssuePropertyDeedVcInput {
  property_id: string;
  property_code: string;
  owner_citizen_id: string;
  property_type: string;
  area_sqm: number | null;
  polygon_geojson: string | null;
}

export interface IssueVcResult {
  credential_id: string;        // ssi_credentials.id
  cred_ex_id: string | null;    // ACA-Py exchange id (null in placeholder)
  wallet_id: string;
  did: string;
  schema_id: string;
  cred_def_id: string;
  is_placeholder: boolean;
}

export interface RevokeVcInput {
  credential_id: string;
  reason: string;
}

@Injectable()
export class SsiService {
  private readonly logger = new Logger(SsiService.name);
  private readonly digitalIdSchemaId: string;
  private readonly digitalIdCredDefId: string;
  private readonly propertyDeedSchemaId: string;
  private readonly propertyDeedCredDefId: string;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly acaPy: AcaPyClient,
  ) {
    this.digitalIdSchemaId = config.get<string>('ACA_PY_DIGITAL_ID_SCHEMA_ID') ?? '';
    this.digitalIdCredDefId = config.get<string>('ACA_PY_DIGITAL_ID_CRED_DEF_ID') ?? '';
    this.propertyDeedSchemaId = config.get<string>('ACA_PY_PROPERTY_DEED_SCHEMA_ID') ?? '';
    this.propertyDeedCredDefId = config.get<string>('ACA_PY_PROPERTY_DEED_CRED_DEF_ID') ?? '';
    if (this.acaPy.enabled) {
      this.logger.log(
        `SSI mode = real (digital_id cred_def=${this.digitalIdCredDefId || '(missing)'}, ` +
          `property_deed cred_def=${this.propertyDeedCredDefId || '(missing)'})`,
      );
    } else {
      this.logger.log('SSI mode = placeholder (ACA_PY_ADMIN_URL not set).');
    }
  }

  // -----------------------------------------------------------------------
  // createWallet — provision an SSI sub-wallet for a citizen on the
  // issuer agent. Idempotent: if a wallet row already exists for the
  // citizen, returns it.
  // -----------------------------------------------------------------------
  async createWallet(citizenId: string): Promise<CreateWalletResult> {
    const existing = await this.supabase.admin
      .from('ssi_wallets')
      .select('id, did, public_key, encrypted_seed, aca_py_token')
      .eq('citizen_id', citizenId)
      .maybeSingle();
    if (existing.error) throw SijilliErrors.upstream(existing.error.message);
    if (existing.data) {
      return {
        wallet_id: existing.data.id as string,
        did: existing.data.did as string,
        public_key: existing.data.public_key as string,
        encrypted_seed: (existing.data.encrypted_seed as string | null) ?? null,
        aca_py_token: (existing.data.aca_py_token as string | null) ?? null,
        is_placeholder: (existing.data.did as string).startsWith(PLACEHOLDER_DID_PREFIX),
      };
    }

    if (!this.acaPy.enabled) {
      return this.createPlaceholderWallet(citizenId);
    }

    // Real path: multitenancy → DID create on the new sub-wallet.
    const walletKey = randomBytes(32).toString('hex');
    const wallet = await this.acaPy.createSubWallet({
      wallet_name: `sijilli-citizen-${citizenId}`,
      wallet_key: walletKey,
      label: `Sijilli citizen ${citizenId.slice(0, 8)}`,
    });
    const did = await this.acaPy.createWalletDid(wallet.token, 'sov');

    const inserted = await this.supabase.admin
      .from('ssi_wallets')
      .insert({
        citizen_id: citizenId,
        did: `did:sov:${did.did}`,
        public_key: did.verkey,
        encrypted_seed: walletKey,
        agent_endpoint: this.config.get<string>('ACA_PY_PUBLIC_ENDPOINT') ?? null,
        aca_py_wallet_id: wallet.wallet_id,
        aca_py_token: wallet.token,
      })
      .select('id, did, public_key, encrypted_seed')
      .single();
    if (inserted.error || !inserted.data) {
      throw SijilliErrors.upstream(`ssi_wallets insert failed: ${inserted.error?.message}`);
    }
    return {
      wallet_id: inserted.data.id as string,
      did: inserted.data.did as string,
      public_key: inserted.data.public_key as string,
      encrypted_seed: (inserted.data.encrypted_seed as string | null) ?? null,
      aca_py_token: wallet.token,
      is_placeholder: false,
    };
  }

  // -----------------------------------------------------------------------
  // issueDigitalIdVc — emits a DigitalId VC for an active card. Called
  // from DigitalIdCardsService when a card transitions to 'active'.
  // -----------------------------------------------------------------------
  async issueDigitalIdVc(input: IssueDigitalIdVcInput): Promise<IssueVcResult> {
    const card = await this.loadCardForVc(input.card_id);
    const wallet = await this.createWallet(card.citizen_id);

    const fullName = card.full_name_ar;
    const attributes = {
      full_name: fullName,
      dob: card.dob ? card.dob.slice(0, 10) : '',
      digital_id_number: card.digital_id_number,
      photo_hash: card.photo_hash ?? '',
    };

    const credDefId = this.digitalIdCredDefId;
    const schemaId = this.digitalIdSchemaId;

    if (this.acaPy.enabled && credDefId && wallet.aca_py_token) {
      const credEx = await this.acaPy.sendCredential(wallet.aca_py_token, {
        cred_def_id: credDefId,
        attributes,
        comment: `Sijilli DigitalId for ${fullName}`,
        connection_id: null,
      });
      return this.persistCredential({
        wallet_id: wallet.wallet_id,
        credential_type: 'DigitalId',
        schema_id: schemaId,
        cred_def_id: credDefId,
        payload: { ...attributes, schema: 'DigitalIdSchema:1.0' },
        cred_ex_id: credEx.cred_ex_id,
        state: credEx.state,
        is_placeholder: false,
        did: wallet.did,
      });
    }

    return this.persistCredential({
      wallet_id: wallet.wallet_id,
      credential_type: 'DigitalId',
      schema_id: schemaId || 'placeholder:schema:digital_id:1.0',
      cred_def_id: credDefId || 'placeholder:cred_def:digital_id',
      payload: { ...attributes, schema: 'DigitalIdSchema:1.0' },
      cred_ex_id: null,
      state: 'placeholder_issued',
      is_placeholder: true,
      did: wallet.did,
    });
  }

  // -----------------------------------------------------------------------
  // issuePropertyDeedVc — replaces the Phase-5 stub.
  // -----------------------------------------------------------------------
  async issuePropertyDeedVc(input: IssuePropertyDeedVcInput): Promise<IssueVcResult> {
    const wallet = await this.createWallet(input.owner_citizen_id);

    const polygonHash = input.polygon_geojson ? sha256Hex(input.polygon_geojson) : '';
    const attributes = {
      property_code: input.property_code,
      owner_did: wallet.did,
      type: input.property_type,
      area_sqm: input.area_sqm !== null ? String(input.area_sqm) : '',
      polygon_hash: polygonHash,
    };

    const schemaId = this.propertyDeedSchemaId;
    const credDefId = this.propertyDeedCredDefId;

    if (this.acaPy.enabled && credDefId && wallet.aca_py_token) {
      const credEx = await this.acaPy.sendCredential(wallet.aca_py_token, {
        cred_def_id: credDefId,
        attributes,
        comment: `Sijilli PropertyDeed ${input.property_code}`,
        connection_id: null,
      });
      return this.persistCredential({
        wallet_id: wallet.wallet_id,
        credential_type: 'PropertyDeed',
        schema_id: schemaId,
        cred_def_id: credDefId,
        payload: { ...attributes, schema: 'PropertyDeedSchema:1.0' },
        cred_ex_id: credEx.cred_ex_id,
        state: credEx.state,
        is_placeholder: false,
        did: wallet.did,
      });
    }

    return this.persistCredential({
      wallet_id: wallet.wallet_id,
      credential_type: 'PropertyDeed',
      schema_id: schemaId || 'placeholder:schema:property_deed:1.0',
      cred_def_id: credDefId || 'placeholder:cred_def:property_deed',
      payload: { ...attributes, schema: 'PropertyDeedSchema:1.0' },
      cred_ex_id: null,
      state: 'placeholder_issued',
      is_placeholder: true,
      did: wallet.did,
    });
  }

  // -----------------------------------------------------------------------
  // revokeVc — flips a credential to revoked state. If the agent is
  // enabled and we have a cred_ex_id, also revokes on the ledger
  // (publishes the revocation registry update).
  // -----------------------------------------------------------------------
  async revokeVc(input: RevokeVcInput) {
    const cred = await this.supabase.admin
      .from('ssi_credentials')
      .select('id, wallet_id, cred_ex_id, revoked_at, state, ssi_wallets:ssi_wallets ( aca_py_token )')
      .eq('id', input.credential_id)
      .maybeSingle();
    if (cred.error) throw SijilliErrors.upstream(cred.error.message);
    if (!cred.data) throw SijilliErrors.notFound('الشهادة الرقمية');
    if (cred.data.revoked_at) {
      throw SijilliErrors.conflict(
        'الشهادة مُلغاة بالفعل.',
        'Credential already revoked.',
      );
    }

    const tenantToken =
      ((cred.data as { ssi_wallets?: { aca_py_token?: string | null } | null })
        .ssi_wallets?.aca_py_token) ?? null;

    if (this.acaPy.enabled && cred.data.cred_ex_id && tenantToken) {
      await this.acaPy.revokeCredential(tenantToken, {
        cred_ex_id: cred.data.cred_ex_id as string,
        publish: true,
        comment: input.reason,
      });
    }

    const updated = await this.supabase.admin
      .from('ssi_credentials')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: input.reason,
        state: 'revoked',
      })
      .eq('id', input.credential_id)
      .select('id, revoked_at, state')
      .single();
    if (updated.error) throw SijilliErrors.upstream(updated.error.message);
    return updated.data;
  }

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------

  private async createPlaceholderWallet(citizenId: string): Promise<CreateWalletResult> {
    const did = `${PLACEHOLDER_DID_PREFIX}${randomUUID()}`;
    const inserted = await this.supabase.admin
      .from('ssi_wallets')
      .insert({
        citizen_id: citizenId,
        did,
        public_key: 'placeholder',
        encrypted_seed: null,
      })
      .select('id, did, public_key, encrypted_seed')
      .single();
    if (inserted.error || !inserted.data) {
      throw SijilliErrors.upstream(`ssi_wallets insert failed: ${inserted.error?.message}`);
    }
    return {
      wallet_id: inserted.data.id as string,
      did: inserted.data.did as string,
      public_key: inserted.data.public_key as string,
      encrypted_seed: null,
      aca_py_token: null,
      is_placeholder: true,
    };
  }

  private async persistCredential(args: {
    wallet_id: string;
    credential_type: 'DigitalId' | 'PropertyDeed';
    schema_id: string;
    cred_def_id: string;
    payload: Record<string, unknown>;
    cred_ex_id: string | null;
    state: string;
    is_placeholder: boolean;
    did: string;
  }): Promise<IssueVcResult> {
    const insert = await this.supabase.admin
      .from('ssi_credentials')
      .insert({
        wallet_id: args.wallet_id,
        credential_type: args.credential_type,
        schema_id: args.schema_id,
        cred_def_id: args.cred_def_id,
        payload: args.payload,
        cred_ex_id: args.cred_ex_id,
        state: args.state,
      })
      .select('id')
      .single();
    if (insert.error || !insert.data) {
      throw SijilliErrors.upstream(
        `Failed to issue ${args.credential_type} VC: ${insert.error?.message}`,
      );
    }
    const internalId = insert.data.id as string;
    const externalId = args.is_placeholder
      ? `${PLACEHOLDER_CRED_PREFIX}${internalId}`
      : `urn:vc:sijilli:${internalId}`;
    return {
      credential_id: externalId,
      cred_ex_id: args.cred_ex_id,
      wallet_id: args.wallet_id,
      did: args.did,
      schema_id: args.schema_id,
      cred_def_id: args.cred_def_id,
      is_placeholder: args.is_placeholder,
    };
  }

  private async loadCardForVc(cardId: string): Promise<{
    card_id: string;
    citizen_id: string;
    digital_id_number: string;
    photo_hash: string | null;
    full_name_ar: string;
    dob: string | null;
  }> {
    const { data, error } = await this.supabase.admin
      .from('digital_id_cards')
      .select(
        'id, citizen_id, digital_id_number, photo_hash, ' +
          'citizens:citizens!citizen_id ( first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar, dob )',
      )
      .eq('id', cardId)
      .maybeSingle();
    if (error) throw SijilliErrors.upstream(error.message);
    if (!data) throw SijilliErrors.notFound('البطاقة');
    const row = data as unknown as {
      id: string;
      citizen_id: string;
      digital_id_number: string;
      photo_hash: string | null;
      citizens: {
        first_name_ar: string;
        father_name_ar: string | null;
        grandfather_name_ar: string | null;
        family_name_ar: string;
        dob: string | null;
      } | null;
    };
    if (!row.citizens) throw SijilliErrors.notFound('المواطن');
    const c = row.citizens;
    const fullName = [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
      .filter(Boolean)
      .join(' ');
    return {
      card_id: row.id,
      citizen_id: row.citizen_id,
      digital_id_number: row.digital_id_number,
      photo_hash: row.photo_hash ?? null,
      full_name_ar: fullName,
      dob: c.dob,
    };
  }
}
