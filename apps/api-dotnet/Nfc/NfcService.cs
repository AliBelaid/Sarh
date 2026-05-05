using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;

namespace Sarh.Api.Nfc;

public sealed class NfcService(
    SarhDbContext db,
    NfcKeyStoreService keyStore)
{
    // Issuer station post-write callback. Confirms the chip was written
    // successfully and binds its UID to the card row.
    public async Task<EncodeCardResult> RecordEncodedAsync(EncodeCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == dto.CardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        var newUid = dto.NfcUid.ToUpperInvariant();
        if (!string.IsNullOrEmpty(card.NfcUid) &&
            !string.Equals(card.NfcUid, newUid, StringComparison.OrdinalIgnoreCase))
        {
            throw SarhException.Conflict(
                "البطاقة مرتبطة بشريحة NFC مختلفة بالفعل.",
                "Card is already bound to a different NFC UID.");
        }

        card.NfcUid = newUid;
        card.LastNfcCounter = 0;

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw SarhException.Conflict(
                "هذه الشريحة مستخدمة في بطاقة أخرى.",
                "This NFC UID is already bound to another card.");
        }

        return new EncodeCardResult
        {
            Card = new EncodedCardSummary
            {
                Id = card.Id,
                CitizenId = card.CitizenId,
                NfcUid = card.NfcUid,
                Status = card.Status,
            },
        };
    }

    // SUN tap verification.
    //
    // - Public endpoint (no auth). The chip's keys are the secret.
    // - On any cryptographic failure we throw 401 with a generic message
    //   to avoid leaking which check failed.
    // - Replay protection compares the decoded counter against
    //   digital_id_cards.last_nfc_counter; equal or older is rejected.
    public async Task<VerifySunResult> VerifyTapAsync(VerifySunDto dto, CancellationToken ct)
    {
        var (piccDataHex, cmacHex, uidHex) = ExtractParts(dto);

        // O(1) fast path when the chip mirrored the plaintext UID.
        // Brute-force fallback over active+frozen cards covers legacy chips
        // configured without SDMUIDOffset.
        IQueryable<Data.Entities.DigitalIdCard> q = db.DigitalIdCards.AsNoTracking()
            .Where(c => c.Status == "active" || c.Status == "frozen");

        if (!string.IsNullOrEmpty(uidHex))
        {
            var upper = uidHex.ToUpperInvariant();
            q = q.Where(c => c.NfcUid == upper);
        }

        var candidates = await q.ToListAsync(ct);

        foreach (var candidate in candidates)
        {
            SunKeys keys;
            try { keys = await keyStore.LoadForCardAsync(candidate.Id, ct); }
            catch { continue; }

            DecodedSun decoded;
            try { decoded = SunMessage.Verify(keys, piccDataHex, cmacHex); }
            catch (SunDecodeException) { continue; }

            // UID must match what we recorded at encode time.
            if (!string.IsNullOrEmpty(candidate.NfcUid))
            {
                var hex = Convert.ToHexString(decoded.Uid);
                if (!string.Equals(hex, candidate.NfcUid, StringComparison.OrdinalIgnoreCase)) continue;
            }

            if (candidate.Status == "revoked") throw SarhException.Forbidden("البطاقة ملغاة.");
            if (candidate.Status == "frozen") throw SarhException.Forbidden("البطاقة مجمّدة.");
            if (candidate.ExpiresAt < DateTimeOffset.UtcNow)
                throw SarhException.Forbidden("البطاقة منتهية الصلاحية.");

            if (decoded.Counter <= candidate.LastNfcCounter)
                throw SarhException.Unauthorized();

            // Atomic-ish update: succeed only if our counter is strictly
            // higher than the persisted one.
            var rows = await db.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE digital_id_cards
                SET last_nfc_counter = {decoded.Counter},
                    last_nfc_tap_at  = SYSDATETIMEOFFSET()
                WHERE id = {candidate.Id}
                  AND last_nfc_counter < {decoded.Counter};", ct);
            if (rows == 0) throw SarhException.Unauthorized();

            var citizen = await db.Citizens.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == candidate.CitizenId, ct)
                ?? throw SarhException.Upstream("Citizen lookup failed");

            var fullNameAr = string.Join(" ", new[]
            {
                citizen.FirstNameAr, citizen.FatherNameAr,
                citizen.GrandfatherNameAr, citizen.FamilyNameAr,
            }.Where(s => !string.IsNullOrWhiteSpace(s)));

            return new VerifySunResult
            {
                CardId = candidate.Id,
                DigitalIdNumber = candidate.DigitalIdNumber,
                Status = candidate.Status,
                Counter = decoded.Counter,
                Citizen = new VerifySunCitizen
                {
                    Id = citizen.Id,
                    FullNameAr = fullNameAr,
                    PhotoPath = citizen.PhotoPath,
                    RegionId = citizen.RegionId,
                },
            };
        }

        throw SarhException.Unauthorized();
    }

    private static (string PiccDataHex, string CmacHex, string? UidHex) ExtractParts(VerifySunDto dto)
    {
        if (!string.IsNullOrEmpty(dto.Url))
        {
            try
            {
                var parsed = SunMessage.ParseUrl(dto.Url);
                return (parsed.PiccDataHex, parsed.CmacHex, parsed.UidHex);
            }
            catch { throw SarhException.Unauthorized(); }
        }
        if (!string.IsNullOrEmpty(dto.P) && !string.IsNullOrEmpty(dto.C))
            return (dto.P, dto.C, null);
        throw SarhException.Unauthorized();
    }

    private const int UNIQUE_VIOLATION = 2627;
    private const int UNIQUE_VIOLATION_INDEX = 2601;
    private static bool IsUnique(DbUpdateException ex) =>
        ex.InnerException is Microsoft.Data.SqlClient.SqlException se &&
        (se.Number == UNIQUE_VIOLATION || se.Number == UNIQUE_VIOLATION_INDEX);
}
