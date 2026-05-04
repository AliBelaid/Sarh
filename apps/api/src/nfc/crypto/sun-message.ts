// NTAG 424 DNA SUN (Secure Unique NFC) message encode + verify.
//
// Reference: NXP AN12196 — "NTAG 424 DNA and NTAG 424 DNA TagTamper
// features and hints", §11 (Secure Dynamic Messaging).
//
// What the chip emits on every tap:
//
//   https://verify.sijilli.ly/v?p=<picc_data_hex>&c=<cmac_hex>
//
// where:
//
//   picc_data (32 hex / 16 bytes), AES-128-CBC encrypted with K_meta_read
//   and IV = 0:
//     plaintext byte 0       : PICCDataTag (0xC7 = UID + counter mirrored)
//     plaintext bytes 1..7   : UID (7 bytes)
//     plaintext bytes 8..10  : SDMReadCtr (3 bytes, little-endian)
//     plaintext bytes 11..15 : random padding (5 bytes)
//
//   cmac (16 hex / 8 bytes) — the "short CMAC" derived from a per-tap
//   session key:
//     SV2          = 0x3CC300010080 || UID || SDMReadCtr     (16 bytes)
//     session_key  = AES-CMAC(K_sdm_file_read, SV2)
//     full_cmac    = AES-CMAC(session_key, "")               (16 bytes)
//     short_cmac   = full_cmac[1, 3, 5, 7, 9, 11, 13, 15]    (8 bytes)
//
// We deliberately keep this module pure (no DB, no Nest dependencies) so
// it can be unit-tested in isolation and re-used by the Edge Function
// that handles `verify.sijilli.ly` in production.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { aesCmac } from './aes-cmac';

const BLOCK = 16;
const PICC_DATA_TAG_UID_AND_COUNTER = 0xc7;
const SV2_PREFIX = Buffer.from('3CC300010080', 'hex'); // 6 bytes

export interface SunKeys {
  // Encrypts the PICC data block (UID + counter).
  metaReadKey: Buffer; // 16 bytes
  // Used to derive per-tap session CMAC keys.
  sdmFileReadKey: Buffer; // 16 bytes
}

export interface DecodedSun {
  uid: Buffer;
  counter: number;
}

export class SunDecodeError extends Error {
  constructor(
    public readonly reason:
      | 'malformed_picc'
      | 'malformed_cmac'
      | 'bad_picc_tag'
      | 'cmac_mismatch',
    detail?: string,
  ) {
    super(`SUN decode failed: ${reason}${detail ? ` (${detail})` : ''}`);
  }
}

// ----------------------------------------------------------------------
// Decode + verify a SUN tap.
// ----------------------------------------------------------------------
export function verifySunMessage(
  keys: SunKeys,
  piccDataHex: string,
  cmacHex: string,
): DecodedSun {
  const picc = parseHex(piccDataHex, 16, 'malformed_picc');
  const providedCmac = parseHex(cmacHex, 8, 'malformed_cmac');

  // 1. Decrypt PICC data with K_meta_read (AES-128-CBC, IV = 0).
  const decipher = createDecipheriv('aes-128-cbc', keys.metaReadKey, Buffer.alloc(BLOCK));
  decipher.setAutoPadding(false);
  const plaintext = Buffer.concat([decipher.update(picc), decipher.final()]);

  if (plaintext[0] !== PICC_DATA_TAG_UID_AND_COUNTER) {
    throw new SunDecodeError('bad_picc_tag', `0x${plaintext[0].toString(16)}`);
  }

  const uid = plaintext.subarray(1, 8);
  const counter = plaintext.readUIntLE(8, 3);

  // 2. Derive the session CMAC key for this (uid, counter).
  const sessionKey = deriveSessionCmacKey(keys.sdmFileReadKey, uid, counter);

  // 3. CMAC over empty input (no encrypted file data in our URL).
  const fullCmac = aesCmac(sessionKey, Buffer.alloc(0));
  const expectedShort = takeShortCmac(fullCmac);

  if (!timingSafeEqual(expectedShort, providedCmac)) {
    throw new SunDecodeError('cmac_mismatch');
  }

  return { uid, counter };
}

// ----------------------------------------------------------------------
// Encode a SUN tap (used by tests and by tooling — the chip itself does
// this in silicon when configured with the same keys).
// ----------------------------------------------------------------------
export function encodeSunMessage(
  keys: SunKeys,
  uid: Buffer,
  counter: number,
  rng: (n: number) => Buffer = randomBytes,
): { piccDataHex: string; cmacHex: string } {
  if (uid.length !== 7) throw new Error(`UID must be 7 bytes, got ${uid.length}`);
  if (counter < 0 || counter > 0xffffff) throw new Error(`counter out of range: ${counter}`);

  const padding = rng(5);
  const plaintext = Buffer.alloc(BLOCK);
  plaintext[0] = PICC_DATA_TAG_UID_AND_COUNTER;
  uid.copy(plaintext, 1);
  plaintext.writeUIntLE(counter, 8, 3);
  padding.copy(plaintext, 11);

  const cipher = createCipheriv('aes-128-cbc', keys.metaReadKey, Buffer.alloc(BLOCK));
  cipher.setAutoPadding(false);
  const piccData = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const sessionKey = deriveSessionCmacKey(keys.sdmFileReadKey, uid, counter);
  const fullCmac = aesCmac(sessionKey, Buffer.alloc(0));
  const shortCmac = takeShortCmac(fullCmac);

  return {
    piccDataHex: piccData.toString('hex').toUpperCase(),
    cmacHex: shortCmac.toString('hex').toUpperCase(),
  };
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
function deriveSessionCmacKey(masterKey: Buffer, uid: Buffer, counter: number): Buffer {
  // SV2 = SV2_PREFIX(6) || UID(7) || Counter(3 LE) = 16 bytes
  const sv2 = Buffer.alloc(BLOCK);
  SV2_PREFIX.copy(sv2, 0);
  uid.copy(sv2, 6);
  sv2.writeUIntLE(counter, 13, 3);
  return aesCmac(masterKey, sv2);
}

function takeShortCmac(fullCmac: Buffer): Buffer {
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) out[i] = fullCmac[i * 2 + 1];
  return out;
}

function parseHex(hex: string, expectedBytes: number, reason: SunDecodeError['reason']): Buffer {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length !== expectedBytes * 2) {
    throw new SunDecodeError(reason, `expected ${expectedBytes * 2} hex chars`);
  }
  return Buffer.from(hex, 'hex');
}

// ----------------------------------------------------------------------
// URL helper — extract picc_data + cmac (and optional plaintext UID hint)
// from a SUN URL emitted by the chip. Accepts either the full URL or just
// the query string.
//
// If the chip is configured with SDMUIDOffset != 0 the URL also contains
// a plaintext UID under `u=<hex>` (or `uid=`). When present, the API can
// do an O(1) lookup by `digital_id_cards.nfc_uid` instead of brute-forcing
// every active card's keys.
// ----------------------------------------------------------------------
export function parseSunUrl(input: string): {
  piccDataHex: string;
  cmacHex: string;
  uidHex?: string;
} {
  const qIndex = input.indexOf('?');
  const qs = qIndex === -1 ? input : input.slice(qIndex + 1);
  const params = new URLSearchParams(qs);
  const picc = params.get('p') ?? params.get('picc_data') ?? '';
  const cmac = params.get('c') ?? params.get('cmac') ?? '';
  if (!picc || !cmac) {
    throw new SunDecodeError('malformed_picc', 'missing p / c query parameters');
  }
  const uid = params.get('u') ?? params.get('uid') ?? null;
  if (uid && !/^[0-9a-fA-F]{14}$/.test(uid)) {
    // Don't throw — UID hint is optional and a malformed one shouldn't
    // block verification. Just drop it.
    return { piccDataHex: picc, cmacHex: cmac };
  }
  return { piccDataHex: picc, cmacHex: cmac, uidHex: uid ?? undefined };
}
