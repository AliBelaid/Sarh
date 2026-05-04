// AES-CMAC (RFC 4493) — hand-rolled to avoid pulling in an extra crypto
// dependency. Verified against the four test vectors in RFC 4493 §4
// (see aes-cmac.spec.ts).
//
// Only AES-128 is supported (NTAG 424 DNA SUN messages always use a
// 128-bit key). For other key sizes the algorithm is identical except
// for Rb (the irreducible polynomial constant) and block size.

import { createCipheriv } from 'node:crypto';

const BLOCK = 16;
const RB = 0x87; // GF(2^128) irreducible polynomial constant for AES-128

function aes128EncryptBlock(key: Buffer, block: Buffer): Buffer {
  if (key.length !== 16) throw new Error(`AES-CMAC requires a 16-byte key, got ${key.length}`);
  if (block.length !== 16) throw new Error(`block must be 16 bytes, got ${block.length}`);
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

// Left shift a 16-byte big-endian integer by 1 bit. Returns the result
// and the bit shifted out (the original MSB).
function shiftLeftOne(input: Buffer): { out: Buffer; carry: number } {
  const out = Buffer.alloc(BLOCK);
  let carry = 0;
  for (let i = BLOCK - 1; i >= 0; i--) {
    const next = (input[i] << 1) | carry;
    out[i] = next & 0xff;
    carry = (input[i] & 0x80) >> 7;
  }
  return { out, carry };
}

function xorInto(target: Buffer, src: Buffer, srcOffset = 0, len = BLOCK): void {
  for (let i = 0; i < len; i++) target[i] ^= src[srcOffset + i];
}

// Generates the two CMAC subkeys K1 and K2 from the cipher key.
function generateSubkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const L = aes128EncryptBlock(key, Buffer.alloc(BLOCK));
  const { out: k1, carry: c1 } = shiftLeftOne(L);
  if ((L[0] & 0x80) !== 0) k1[BLOCK - 1] ^= RB;
  const { out: k2 } = shiftLeftOne(k1);
  if ((k1[0] & 0x80) !== 0) k2[BLOCK - 1] ^= RB;
  // c1 is unused — left here intentionally to make the relationship to
  // the algorithm explicit.
  void c1;
  return { k1, k2 };
}

export function aesCmac(key: Buffer, message: Buffer): Buffer {
  const { k1, k2 } = generateSubkeys(key);
  const n = Math.max(1, Math.ceil(message.length / BLOCK));
  const lastBlockComplete = message.length > 0 && message.length % BLOCK === 0;

  // Build the last block M_n* (with subkey applied).
  const mLast = Buffer.alloc(BLOCK);
  if (lastBlockComplete) {
    message.copy(mLast, 0, (n - 1) * BLOCK, n * BLOCK);
    xorInto(mLast, k1);
  } else {
    const start = (n - 1) * BLOCK;
    const partialLen = message.length - start;
    if (partialLen > 0) message.copy(mLast, 0, start, message.length);
    mLast[partialLen] = 0x80; // pad with 1 bit followed by zeros
    xorInto(mLast, k2);
  }

  // CBC-MAC chain over M_1 ... M_{n-1}, then M_n*.
  let x: Buffer = Buffer.alloc(BLOCK);
  for (let i = 0; i < n - 1; i++) {
    const block = message.subarray(i * BLOCK, (i + 1) * BLOCK);
    const xored = Buffer.alloc(BLOCK);
    for (let j = 0; j < BLOCK; j++) xored[j] = x[j] ^ block[j];
    x = aes128EncryptBlock(key, xored);
  }
  for (let j = 0; j < BLOCK; j++) x[j] ^= mLast[j];
  return aes128EncryptBlock(key, x);
}
