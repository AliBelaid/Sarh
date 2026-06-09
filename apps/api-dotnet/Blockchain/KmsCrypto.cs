using System.Security.Cryptography;
using System.Text;

namespace Sarh.Api.Blockchain;

// Small, self-contained AES-256-GCM wrap/unwrap around KMS_MASTER_KEY
// (Sarh:KmsMasterKey, 32 bytes hex). Unlike NfcKeyStoreService (which stores
// iv + ciphertext in separate DB columns), this packs everything into ONE
// base64 string: [12-byte IV][ciphertext][16-byte tag]. That single blob is
// what Sarh:Blockchain:MinterPrivateKeyEnc holds, so the minter key can live
// in config (or a secret store) without a DB row.
//
// Mirrors the wrap format used for the NFC card keys so a future shared KMS
// swap covers both. The same master key decrypts both.
public static class KmsCrypto
{
    private const int IvLen = 12;
    private const int TagLen = 16;

    public static byte[] MasterKeyFromConfig(IConfiguration config)
    {
        var hex = config["Sarh:KmsMasterKey"] ?? Environment.GetEnvironmentVariable("KMS_MASTER_KEY");
        if (string.IsNullOrWhiteSpace(hex))
            throw new InvalidOperationException(
                "KMS_MASTER_KEY (or Sarh:KmsMasterKey) is required to wrap/unwrap the minter key. " +
                "Generate one with: openssl rand -hex 32");
        if (hex.Length != 64 || !System.Text.RegularExpressions.Regex.IsMatch(hex, "^[0-9a-fA-F]+$"))
            throw new InvalidOperationException("KMS_MASTER_KEY must be 64 hex characters (32 bytes).");
        return Convert.FromHexString(hex);
    }

    // plaintext (e.g. the raw 0x-hex private key string) → base64 blob.
    public static string Encrypt(byte[] masterKey, string plaintext)
    {
        var pt = Encoding.UTF8.GetBytes(plaintext);
        var iv = RandomNumberGenerator.GetBytes(IvLen);
        var enc = new byte[pt.Length];
        var tag = new byte[TagLen];
        using var gcm = new AesGcm(masterKey, TagLen);
        gcm.Encrypt(iv, pt, enc, tag);

        var blob = new byte[IvLen + enc.Length + TagLen];
        Buffer.BlockCopy(iv, 0, blob, 0, IvLen);
        Buffer.BlockCopy(enc, 0, blob, IvLen, enc.Length);
        Buffer.BlockCopy(tag, 0, blob, IvLen + enc.Length, TagLen);
        return Convert.ToBase64String(blob);
    }

    // base64 blob → plaintext. Throws CryptographicException on a bad key /
    // tampered blob.
    public static string Decrypt(byte[] masterKey, string base64Blob)
    {
        var blob = Convert.FromBase64String(base64Blob.Trim());
        if (blob.Length < IvLen + TagLen)
            throw new InvalidOperationException("MinterPrivateKeyEnc blob is too short to be valid.");

        var iv = new byte[IvLen];
        var tag = new byte[TagLen];
        var encLen = blob.Length - IvLen - TagLen;
        var enc = new byte[encLen];
        Buffer.BlockCopy(blob, 0, iv, 0, IvLen);
        Buffer.BlockCopy(blob, IvLen, enc, 0, encLen);
        Buffer.BlockCopy(blob, IvLen + encLen, tag, 0, TagLen);

        var pt = new byte[encLen];
        using var gcm = new AesGcm(masterKey, TagLen);
        gcm.Decrypt(iv, enc, tag, pt);
        return Encoding.UTF8.GetString(pt);
    }
}
