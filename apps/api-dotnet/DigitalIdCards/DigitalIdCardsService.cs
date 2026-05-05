using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;
using Sarh.Api.Nfc;
using Sarh.Api.Notifications;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService(
    SarhDbContext db,
    DigitalIdNumberService numbers,
    NfcKeyStoreService keyStore,
    NotificationsService notifications,
    IConfiguration config,
    ILogger<DigitalIdCardsService> log)
{
    private static readonly Regex PhotoSha256Re = new("^[0-9a-fA-F]{64}$");

    // ---------------- LIST ----------------
    public async Task<CursorPage<CardView>> ListAsync(ListCardsQuery q, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        IQueryable<DigitalIdCard> query = db.DigitalIdCards.AsNoTracking();

        if (!string.IsNullOrEmpty(q.Status)) query = query.Where(c => c.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Cursor) && DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
            query = query.Where(c => c.IssuedAt < cursorTs);
        if (!string.IsNullOrWhiteSpace(q.Q) && q.Q.Trim().Length >= 2)
        {
            var pat = "%" + q.Q.Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
            query = query.Where(c => EF.Functions.Like(c.DigitalIdNumber, pat));
        }

        var rows = await query
            .OrderByDescending(c => c.IssuedAt)
            .ThenByDescending(c => c.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            nextCursor = rows[q.Limit].IssuedAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }

        // Fetch citizen summaries for the page in a single round-trip.
        var citizenIds = rows.Select(r => r.CitizenId).Distinct().ToList();
        var citizenMap = await db.Citizens.AsNoTracking()
            .Where(c => citizenIds.Contains(c.Id))
            .Select(c => new CardCitizenSummary
            {
                Id = c.Id,
                FirstNameAr = c.FirstNameAr,
                FatherNameAr = c.FatherNameAr,
                FamilyNameAr = c.FamilyNameAr,
                RegionId = c.RegionId,
                Phone = c.Phone,
            })
            .ToDictionaryAsync(c => c.Id, ct);

        return new CursorPage<CardView>
        {
            Items = rows.Select(c => CardView.From(c, citizenMap.GetValueOrDefault(c.CitizenId))).ToList(),
            NextCursor = nextCursor,
        };
    }

    // ---------------- ISSUE ----------------
    public async Task<IssueCardResult> IssueAsync(IssueCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var citizen = await db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == dto.CitizenId, ct);
        if (citizen is null || !citizen.IsActive) throw SarhException.NotFound("المواطن", "Citizen");

        var hasActive = await db.DigitalIdCards.AsNoTracking()
            .AnyAsync(c => c.CitizenId == dto.CitizenId && c.Status == "active", ct);
        if (hasActive)
            throw SarhException.Conflict(
                "يوجد بطاقة فعّالة لهذا المواطن. استخدم إعادة الإصدار بدلاً من إصدار جديد.",
                "Citizen already has an active card; use /reissue.");

        var photoHash = ResolvePhotoHash(dto, citizen.PhotoPath);

        var year = dto.Year ?? DateTime.UtcNow.Year;
        var digitalIdNumber = await numbers.NextAsync(dto.RegionCode, year, ct);

        var validityYears = dto.ValidityYears ?? 5;
        var expiresAt = DateTimeOffset.UtcNow.AddYears(validityYears);
        var cardSerial = $"LY-{RandomHexUpper(12)}";

        var card = new DigitalIdCard
        {
            Id = Guid.NewGuid(),
            CitizenId = dto.CitizenId,
            DigitalIdNumber = digitalIdNumber,
            CardSerial = cardSerial,
            PhotoHash = photoHash,
            IssuedByOfficerId = actor.OfficerId,
            IssuedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt,
            Status = "active",
            LastNfcCounter = 0,
        };
        db.DigitalIdCards.Add(card);

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw SarhException.Conflict(
                "تعارض في رقم البطاقة أو الرقم الرقمي.",
                "Conflict on card_serial or digital_id_number.");
        }

        var keys = await keyStore.MintForCardAsync(card.Id, ct);

        db.IdIssuanceHistory.Add(new IdIssuanceHistory
        {
            Id = Guid.NewGuid(),
            CitizenId = dto.CitizenId,
            CardId = card.Id,
            Action = "issued",
            Reason = null,
            OfficerId = actor.OfficerId,
        });
        await db.SaveChangesAsync(ct);

        // VC issuance is best-effort; placeholder until Phase 12 wires ACA-Py.
        AttachPlaceholderVc(card);
        await db.SaveChangesAsync(ct);

        await notifications.NotifyCitizenAsync(
            card.CitizenId,
            "تم إصدار بطاقة الهوية الرقمية",
            $"تم إصدار بطاقتك برقم {card.DigitalIdNumber}.",
            new { card_id = card.Id, digital_id_number = card.DigitalIdNumber },
            ct);

        return new IssueCardResult
        {
            Card = CardView.From(card),
            NfcKeys = new IssueCardNfcKeys
            {
                MetaReadKeyHex = Convert.ToHexString(keys.MetaReadKey),
                SdmFileReadKeyHex = Convert.ToHexString(keys.SdmFileReadKey),
                KmsKeyId = NfcKeyStoreService.LocalKmsKeyId,
            },
            SunUrlTemplate = SunUrlTemplate(),
        };
    }

    // ---------------- FREEZE / REVOKE ----------------
    public Task<CardView> FreezeAsync(Guid cardId, FreezeCardDto dto, CurrentUser actor, CancellationToken ct)
        => TransitionAsync(cardId, "frozen", dto.Reason, actor, "frozen", ct);

    public Task<CardView> RevokeAsync(Guid cardId, RevokeCardDto dto, CurrentUser actor, CancellationToken ct)
        => TransitionAsync(cardId, "revoked", dto.Reason, actor, "revoked", ct);

    // ---------------- REISSUE ----------------
    public async Task<IssueCardResult> ReissueAsync(Guid cardId, ReissueCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var old = await db.DigitalIdCards.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        await TransitionAsync(cardId, "revoked", $"إعادة إصدار: {dto.Reason}", actor, "revoked", ct);

        var year = DateTime.UtcNow.Year;
        var region = ParseRegionFromDigitalId(old.DigitalIdNumber);
        var digitalIdNumber = dto.KeepDigitalIdNumber == false
            ? await numbers.NextAsync(region, year, ct)
            : old.DigitalIdNumber;

        var cardSerial = $"LY-{RandomHexUpper(12)}";
        var card = new DigitalIdCard
        {
            Id = Guid.NewGuid(),
            CitizenId = old.CitizenId,
            DigitalIdNumber = digitalIdNumber,
            CardSerial = cardSerial,
            PhotoHash = old.PhotoHash,
            IssuedByOfficerId = actor.OfficerId,
            IssuedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddYears(5),
            Status = "active",
            LastNfcCounter = 0,
        };
        db.DigitalIdCards.Add(card);

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw SarhException.Conflict(
                "تعارض في رقم البطاقة الجديد.",
                "Conflict on reissued card_serial / digital_id_number.");
        }

        var keys = await keyStore.MintForCardAsync(card.Id, ct);

        db.IdIssuanceHistory.Add(new IdIssuanceHistory
        {
            Id = Guid.NewGuid(),
            CitizenId = old.CitizenId,
            CardId = card.Id,
            Action = "re-issued",
            Reason = dto.Reason,
            OfficerId = actor.OfficerId,
        });
        await db.SaveChangesAsync(ct);

        AttachPlaceholderVc(card);
        await db.SaveChangesAsync(ct);

        return new IssueCardResult
        {
            Card = CardView.From(card),
            NfcKeys = new IssueCardNfcKeys
            {
                MetaReadKeyHex = Convert.ToHexString(keys.MetaReadKey),
                SdmFileReadKeyHex = Convert.ToHexString(keys.SdmFileReadKey),
                KmsKeyId = NfcKeyStoreService.LocalKmsKeyId,
            },
            SunUrlTemplate = SunUrlTemplate(),
        };
    }

    // ---------------- helpers ----------------
    private async Task<CardView> TransitionAsync(
        Guid cardId, string nextStatus, string reason, CurrentUser actor,
        string historyAction, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        if (card.Status == "revoked")
            throw SarhException.Conflict(
                "البطاقة مُلغاة بالفعل ولا يمكن تعديل حالتها.",
                "Card is already revoked.");
        if (nextStatus == "frozen" && card.Status == "frozen")
            throw SarhException.Conflict("البطاقة مجمّدة بالفعل.", "Card is already frozen.");

        card.Status = nextStatus;
        if (nextStatus == "revoked")
        {
            card.RevokedAt = DateTimeOffset.UtcNow;
            card.RevokedReason = reason;
        }

        db.IdIssuanceHistory.Add(new IdIssuanceHistory
        {
            Id = Guid.NewGuid(),
            CitizenId = card.CitizenId,
            CardId = card.Id,
            Action = historyAction,
            Reason = reason,
            OfficerId = actor.OfficerId,
        });

        await db.SaveChangesAsync(ct);
        return CardView.From(card);
    }

    private string ResolvePhotoHash(IssueCardDto dto, string? citizenPhotoPath)
    {
        if (!string.IsNullOrEmpty(dto.PhotoSha256))
        {
            if (!PhotoSha256Re.IsMatch(dto.PhotoSha256))
                throw SarhException.Validation(
                    "بصمة الصورة غير صالحة (يجب أن تكون 64 حرفاً سادس عشر).",
                    "photo_sha256 must be 64 hex characters.");
            return dto.PhotoSha256.ToLowerInvariant();
        }

        var path = dto.PhotoPath ?? citizenPhotoPath;
        if (string.IsNullOrEmpty(path))
            throw SarhException.Validation(
                "يجب توفير صورة المواطن أو بصمتها قبل إصدار البطاقة.",
                "Either photo_path or photo_sha256 is required.");

        // Local-FS storage hashing lands in Phase 5; until then we deterministically
        // hash the storage path so the column has a stable value.
        log.LogInformation("Photo hash placeholder for path {Path} until Phase 5 storage land", path);
        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(path));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private void AttachPlaceholderVc(DigitalIdCard card)
    {
        card.Did = $"did:placeholder:LY:{Guid.NewGuid():N}";
    }

    private string SunUrlTemplate()
    {
        var baseUrl = config["Sarh:NfcSunBaseUrl"]
            ?? Environment.GetEnvironmentVariable("NFC_SUN_BASE_URL")
            ?? "https://verify.sarh.ly/v";
        return $"{baseUrl}?p={{picc}}&c={{cmac}}";
    }

    private static string RandomHexUpper(int bytes) =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(bytes));

    private static string ParseRegionFromDigitalId(string id)
    {
        var m = Regex.Match(id, "^LY-([0-9]{2,4})-");
        if (!m.Success) throw SarhException.Upstream($"Cannot parse region from digital ID: {id}");
        return m.Groups[1].Value;
    }

    private const int UNIQUE_VIOLATION = 2627;
    private const int UNIQUE_VIOLATION_INDEX = 2601;

    private static bool IsUnique(DbUpdateException ex) =>
        ex.InnerException is Microsoft.Data.SqlClient.SqlException se &&
        (se.Number == UNIQUE_VIOLATION || se.Number == UNIQUE_VIOLATION_INDEX);
}
