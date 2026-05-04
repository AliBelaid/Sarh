// NfcKeyStore — abstraction over the place where per-card NFC keys are
// stored at rest. Two AES-128 keys are minted at issuance time and must
// survive the lifetime of the card so that the server can verify taps.
//
// Local implementation (this file): each per-card key is wrapped with
// AES-256-GCM using KMS_MASTER_KEY (32 bytes hex from env). Ciphertext +
// IV + auth tag live in the nfc_card_secrets table. KMS_MASTER_KEY itself
// is the only secret outside the database.
//
// Production swaps this implementation for one that calls AWS KMS / GCP
// KMS / HashiCorp Vault — the public API of this service does not change.
// `kms_key_id` becomes a real KMS resource id instead of `local:v1`.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SunKeys } from './crypto/sun-message';

const LOCAL_KMS_KEY_ID = 'local:v1';
const WRAP_ALG = 'AES-256-GCM';
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;

interface WrappedKey {
  iv: Buffer;
  ciphertext: Buffer; // includes the 16-byte auth tag at the end
}

@Injectable()
export class NfcKeyStoreService implements OnModuleInit {
  private readonly logger = new Logger(NfcKeyStoreService.name);
  private masterKey!: Buffer;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  onModuleInit() {
    const hex = this.config.get<string>('KMS_MASTER_KEY');
    if (!hex) {
      throw new Error(
        'KMS_MASTER_KEY env var is required. Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('KMS_MASTER_KEY must be 64 hex characters (32 bytes).');
    }
    this.masterKey = Buffer.from(hex, 'hex');
  }

  // --------------------------------------------------------------------
  // Mint a fresh pair of keys for a brand-new card. Stores the wrapped
  // keys in nfc_card_secrets and returns the plaintext keys ONCE so the
  // issuer station can write them to the chip. They are not retrievable
  // after this call returns.
  // --------------------------------------------------------------------
  async mintForCard(cardId: string): Promise<SunKeys> {
    const keys: SunKeys = {
      metaReadKey: randomBytes(16),
      sdmFileReadKey: randomBytes(16),
    };

    const wrappedMeta = this.wrap(keys.metaReadKey);
    const wrappedSdm = this.wrap(keys.sdmFileReadKey);

    const { error } = await this.supabase.admin.from('nfc_card_secrets').insert({
      card_id: cardId,
      meta_read_key_enc: wrappedMeta.ciphertext,
      meta_read_key_iv: wrappedMeta.iv,
      sdm_file_read_key_enc: wrappedSdm.ciphertext,
      sdm_file_read_key_iv: wrappedSdm.iv,
      kms_key_id: LOCAL_KMS_KEY_ID,
      wrap_alg: WRAP_ALG,
    });

    if (error) {
      throw SijilliErrors.upstream(`Failed to persist NFC card secret: ${error.message}`);
    }

    // Mark the card itself with the KMS pointer (column from 004_digital_id.sql).
    await this.supabase.admin
      .from('digital_id_cards')
      .update({ nfc_signature_key_id: LOCAL_KMS_KEY_ID })
      .eq('id', cardId);

    return keys;
  }

  // --------------------------------------------------------------------
  // Load and unwrap the keys for a card during /nfc/verify.
  // --------------------------------------------------------------------
  async loadForCard(cardId: string): Promise<SunKeys> {
    const { data, error } = await this.supabase.admin
      .from('nfc_card_secrets')
      .select('meta_read_key_enc, meta_read_key_iv, sdm_file_read_key_enc, sdm_file_read_key_iv, wrap_alg, kms_key_id')
      .eq('card_id', cardId)
      .maybeSingle();

    if (error) throw SijilliErrors.upstream(`Failed to load NFC card secret: ${error.message}`);
    if (!data) throw SijilliErrors.notFound('مفاتيح البطاقة');
    if (data.wrap_alg !== WRAP_ALG) {
      throw SijilliErrors.upstream(`Unsupported wrap algorithm: ${data.wrap_alg}`);
    }
    if (data.kms_key_id !== LOCAL_KMS_KEY_ID) {
      // A future phase will route through the configured KMS provider.
      throw SijilliErrors.upstream(`Unsupported KMS key id: ${data.kms_key_id}`);
    }

    return {
      metaReadKey: this.unwrap({
        iv: toBuffer(data.meta_read_key_iv),
        ciphertext: toBuffer(data.meta_read_key_enc),
      }),
      sdmFileReadKey: this.unwrap({
        iv: toBuffer(data.sdm_file_read_key_iv),
        ciphertext: toBuffer(data.sdm_file_read_key_enc),
      }),
    };
  }

  // --------------------------------------------------------------------
  // AES-256-GCM wrap/unwrap.
  // --------------------------------------------------------------------
  private wrap(plaintext: Buffer): WrappedKey {
    const iv = randomBytes(GCM_IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv, ciphertext: Buffer.concat([enc, tag]) };
  }

  private unwrap(w: WrappedKey): Buffer {
    if (w.ciphertext.length < GCM_TAG_LEN) {
      throw new Error(`unwrap: ciphertext too short (${w.ciphertext.length})`);
    }
    const tagOffset = w.ciphertext.length - GCM_TAG_LEN;
    const enc = w.ciphertext.subarray(0, tagOffset);
    const tag = w.ciphertext.subarray(tagOffset);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, w.iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  }
}

// Supabase returns BYTEA columns as either a Buffer (Node driver) or a
// `\x...`-prefixed hex string depending on the path. Normalise.
function toBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'string') {
    const hex = v.startsWith('\\x') ? v.slice(2) : v;
    return Buffer.from(hex, 'hex');
  }
  throw new Error(`unexpected BYTEA value type: ${typeof v}`);
}
