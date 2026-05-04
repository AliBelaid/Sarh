import {
  encodeSunMessage,
  parseSunUrl,
  SunDecodeError,
  SunKeys,
  verifySunMessage,
} from './sun-message';

const KEYS: SunKeys = {
  metaReadKey: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
  sdmFileReadKey: Buffer.from('ffeeddccbbaa99887766554433221100', 'hex'),
};

const TEST_UID = Buffer.from('04 12 34 56 78 9A BC'.replace(/\s/g, ''), 'hex');
const FIXED_RNG = (n: number) => Buffer.alloc(n, 0x55);

describe('encode → verify round trip', () => {
  it('round-trips a single tap', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 1, FIXED_RNG);
    const dec = verifySunMessage(KEYS, enc.piccDataHex, enc.cmacHex);
    expect(dec.uid.toString('hex')).toBe(TEST_UID.toString('hex'));
    expect(dec.counter).toBe(1);
  });

  it.each([0, 1, 2, 99, 65535, 0xffffff])('round-trips counter=%i', (ctr) => {
    const enc = encodeSunMessage(KEYS, TEST_UID, ctr, FIXED_RNG);
    const dec = verifySunMessage(KEYS, enc.piccDataHex, enc.cmacHex);
    expect(dec.counter).toBe(ctr);
  });

  it('changes both PICC and CMAC when the counter advances', () => {
    const a = encodeSunMessage(KEYS, TEST_UID, 1, FIXED_RNG);
    const b = encodeSunMessage(KEYS, TEST_UID, 2, FIXED_RNG);
    expect(a.piccDataHex).not.toBe(b.piccDataHex);
    expect(a.cmacHex).not.toBe(b.cmacHex);
  });
});

describe('verify failure modes', () => {
  it('rejects PICC data of wrong length', () => {
    expect(() => verifySunMessage(KEYS, 'aa', 'aabbccddeeff0011')).toThrow(SunDecodeError);
  });

  it('rejects PICC data with non-hex chars', () => {
    expect(() => verifySunMessage(KEYS, 'zz'.repeat(16), 'aabbccddeeff0011')).toThrow(
      SunDecodeError,
    );
  });

  it('rejects a tampered CMAC', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 5, FIXED_RNG);
    const tampered = enc.cmacHex.slice(0, -2) + (enc.cmacHex.endsWith('00') ? '11' : '00');
    expect(() => verifySunMessage(KEYS, enc.piccDataHex, tampered)).toThrow(SunDecodeError);
  });

  it('rejects PICC data encrypted with the wrong K_meta_read', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 5, FIXED_RNG);
    const wrong: SunKeys = {
      metaReadKey: Buffer.alloc(16, 0xaa),
      sdmFileReadKey: KEYS.sdmFileReadKey,
    };
    // Decryption succeeds but PICC tag will mismatch.
    expect(() => verifySunMessage(wrong, enc.piccDataHex, enc.cmacHex)).toThrow(SunDecodeError);
  });

  it('rejects CMAC computed with the wrong K_sdm_file_read', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 5, FIXED_RNG);
    const wrong: SunKeys = {
      metaReadKey: KEYS.metaReadKey,
      sdmFileReadKey: Buffer.alloc(16, 0xbb),
    };
    expect(() => verifySunMessage(wrong, enc.piccDataHex, enc.cmacHex)).toThrow(SunDecodeError);
  });
});

describe('parseSunUrl()', () => {
  it('parses the canonical short form', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 7, FIXED_RNG);
    const url = `https://verify.sijilli.ly/v?p=${enc.piccDataHex}&c=${enc.cmacHex}`;
    const parts = parseSunUrl(url);
    expect(parts).toEqual({ piccDataHex: enc.piccDataHex, cmacHex: enc.cmacHex });
  });

  it('also accepts the long form picc_data / cmac', () => {
    const enc = encodeSunMessage(KEYS, TEST_UID, 7, FIXED_RNG);
    const url = `?picc_data=${enc.piccDataHex}&cmac=${enc.cmacHex}`;
    const parts = parseSunUrl(url);
    expect(parts).toEqual({ piccDataHex: enc.piccDataHex, cmacHex: enc.cmacHex });
  });

  it('throws on missing parameters', () => {
    expect(() => parseSunUrl('?p=ff')).toThrow(SunDecodeError);
  });
});
