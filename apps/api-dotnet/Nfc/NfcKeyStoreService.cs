using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;
using Sijilli.Api.Data.Entities;

namespace Sijilli.Api.Nfc;

// NfcKeyStore — wraps the per-card NFC keys at rest with AES-256-GCM using
// KMS_MASTER_KEY (32 bytes hex from env). Mirrors
// apps/api/src/nfc/nfc-key-store.service.ts. A future phase swaps the local
// implementation for AWS KMS / GCP KMS / Vault — the public API does not change.
public sealed class NfcKeyStoreService
{
    public const string LocalKmsKeyId = "local:v1";
    public const string WrapAlg = "AES-256-GCM";
    private const int GcmIvLen = 12;
    private const int GcmTagLen = 16;

    private readonly byte[] _masterKey;
    private readonly SijilliDbContext _db;

    public NfcKeyStoreService(IConfiguration config, SijilliDbContext db)
    {
        _db = db;
        var hex = config["Sijilli:KmsMasterKey"] ?? Environment.GetEnvironmentVariable("KMS_MASTER_KEY");
        if (string.IsNullOrWhiteSpace(hex))
            throw new InvalidOperationException(
                "KMS_MASTER_KEY (or Sijilli:KmsMasterKey) is required. Generate one with: " +
                "openssl rand -hex 32");
        if (hex.Length != 64 || !System.Text.RegularExpressions.Regex.IsMatch(hex, "^[0-9a-fA-F]+$"))
            throw new InvalidOperationException("KMS_MASTER_KEY must be 64 hex characters (32 bytes).");
        _masterKey = Convert.FromHexString(hex);
    }

    // Mint a fresh pair of keys for a brand-new card. Stores the wrapped
    // keys in nfc_card_secrets and returns the plaintext keys ONCE so the
    // issuer station can write them to the chip.
    public async Task<SunKeys> MintForCardAsync(Guid cardId, CancellationToken ct)
    {
        var meta = RandomNumberGenerator.GetBytes(16);
        var sdm = RandomNumberGenerator.GetBytes(16);
        var wrappedMeta = Wrap(meta);
        var wrappedSdm = Wrap(sdm);

        _db.NfcCardSecrets.Add(new NfcCardSecret
        {
            Id = Guid.NewGuid(),
            CardId = cardId,
            MetaReadKeyEnc = wrappedMeta.Ciphertext,
            MetaReadKeyIv = wrappedMeta.Iv,
            SdmFileReadKeyEnc = wrappedSdm.Ciphertext,
            SdmFileReadKeyIv = wrappedSdm.Iv,
            KmsKeyId = LocalKmsKeyId,
            WrapAlg = WrapAlg,
        });

        // Mark the card itself with the KMS pointer.
        var card = await _db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct);
        if (card is not null) card.NfcSignatureKeyId = LocalKmsKeyId;

        await _db.SaveChangesAsync(ct);

        return new SunKeys
        {
            MetaReadKey = meta,
            SdmFileReadKey = sdm,
        };
    }

    public async Task<SunKeys> LoadForCardAsync(Guid cardId, CancellationToken ct)
    {
        var secret = await _db.NfcCardSecrets.AsNoTracking().FirstOrDefaultAsync(s => s.CardId == cardId, ct)
            ?? throw SijilliException.NotFound("مفاتيح البطاقة", "Card keys");
        if (secret.WrapAlg != WrapAlg)
            throw SijilliException.Upstream($"Unsupported wrap algorithm: {secret.WrapAlg}");
        if (secret.KmsKeyId != LocalKmsKeyId)
            throw SijilliException.Upstream($"Unsupported KMS key id: {secret.KmsKeyId}");

        return new SunKeys
        {
            MetaReadKey = Unwrap(secret.MetaReadKeyEnc, secret.MetaReadKeyIv),
            SdmFileReadKey = Unwrap(secret.SdmFileReadKeyEnc, secret.SdmFileReadKeyIv),
        };
    }

    private (byte[] Iv, byte[] Ciphertext) Wrap(byte[] plaintext)
    {
        var iv = RandomNumberGenerator.GetBytes(GcmIvLen);
        var enc = new byte[plaintext.Length];
        var tag = new byte[GcmTagLen];
        using var gcm = new AesGcm(_masterKey, GcmTagLen);
        gcm.Encrypt(iv, plaintext, enc, tag);
        var ciphertext = new byte[enc.Length + GcmTagLen];
        Buffer.BlockCopy(enc, 0, ciphertext, 0, enc.Length);
        Buffer.BlockCopy(tag, 0, ciphertext, enc.Length, GcmTagLen);
        return (iv, ciphertext);
    }

    private byte[] Unwrap(byte[] ciphertext, byte[] iv)
    {
        if (ciphertext.Length < GcmTagLen)
            throw new InvalidOperationException($"unwrap: ciphertext too short ({ciphertext.Length})");
        int encLen = ciphertext.Length - GcmTagLen;
        var enc = new byte[encLen];
        var tag = new byte[GcmTagLen];
        Buffer.BlockCopy(ciphertext, 0, enc, 0, encLen);
        Buffer.BlockCopy(ciphertext, encLen, tag, 0, GcmTagLen);
        var plaintext = new byte[encLen];
        using var gcm = new AesGcm(_masterKey, GcmTagLen);
        gcm.Decrypt(iv, enc, tag, plaintext);
        return plaintext;
    }
}

