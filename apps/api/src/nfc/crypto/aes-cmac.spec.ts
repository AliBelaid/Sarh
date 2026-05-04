import { aesCmac } from './aes-cmac';

// All four test vectors from RFC 4493 §4 (AES-128).
// Key: 2b7e1516 28aed2a6 abf71588 09cf4f3c
const RFC_KEY = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');

describe('aesCmac() — RFC 4493 test vectors', () => {
  it('Example 1: empty message', () => {
    const tag = aesCmac(RFC_KEY, Buffer.alloc(0));
    expect(tag.toString('hex')).toBe('bb1d6929e95937287fa37d129b756746');
  });

  it('Example 2: 16-byte message (one full block)', () => {
    const msg = Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex');
    const tag = aesCmac(RFC_KEY, msg);
    expect(tag.toString('hex')).toBe('070a16b46b4d4144f79bdd9dd04a287c');
  });

  it('Example 3: 40-byte message (partial last block)', () => {
    const msg = Buffer.from(
      '6bc1bee22e409f96e93d7e117393172a' +
        'ae2d8a571e03ac9c9eb76fac45af8e51' +
        '30c81c46a35ce411',
      'hex',
    );
    const tag = aesCmac(RFC_KEY, msg);
    expect(tag.toString('hex')).toBe('dfa66747de9ae63030ca32611497c827');
  });

  it('Example 4: 64-byte message (four full blocks)', () => {
    const msg = Buffer.from(
      '6bc1bee22e409f96e93d7e117393172a' +
        'ae2d8a571e03ac9c9eb76fac45af8e51' +
        '30c81c46a35ce411e5fbc1191a0a52ef' +
        'f69f2445df4f9b17ad2b417be66c3710',
      'hex',
    );
    const tag = aesCmac(RFC_KEY, msg);
    expect(tag.toString('hex')).toBe('51f0bebf7e3b9d92fc49741779363cfe');
  });
});

describe('aesCmac() — argument validation', () => {
  it('rejects keys that are not 16 bytes', () => {
    expect(() => aesCmac(Buffer.alloc(8), Buffer.alloc(0))).toThrow();
    expect(() => aesCmac(Buffer.alloc(32), Buffer.alloc(0))).toThrow();
  });
});
