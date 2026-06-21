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
    Sarh.Api.Ssi.ISsiService ssi,
    IConfiguration config,
    ILogger<DigitalIdCardsService> log)
{
    private static readonly Regex PhotoSha256Re = new("^[0-9a-fA-F]{64}$");

    // ---------------- LIST ----------------
    public async Task<CursorPage<CardView>> ListAsync(ListCardsQuery q, CurrentUser actor, CancellationToken ct)
    {
        IQueryable<DigitalIdCard> query = db.DigitalIdCards.AsNoTracking();

        // Citizens can only see their own card. Officers see what they query.
        if (actor.OfficerId is null)
        {
            if (actor.CitizenId is null) throw SarhException.Forbidden();
            query = query.Where(c => c.CitizenId == actor.CitizenId.Value);
        }
        else if (q.CitizenId is Guid cid)
        {
            query = query.Where(c => c.CitizenId == cid);
        }

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

        var citizen = await db.Citizens.FirstOrDefaultAsync(c => c.Id == dto.CitizenId, ct);
        if (citizen is null || !citizen.IsActive) throw SarhException.NotFound("المواطن", "Citizen");

        var hasActive = await db.DigitalIdCards.AsNoTracking()
            .AnyAsync(c => c.CitizenId == dto.CitizenId && c.Status == "active", ct);
        if (hasActive)
            throw SarhException.Conflict(
                "يوجد بطاقة فعّالة لهذا المواطن. استخدم إعادة الإصدار بدلاً من إصدار جديد.",
                "Citizen already has an active card; use /reissue.");

        // Persist the upload onto the citizen so /citizens/:id/photo can serve it.
        if (!string.IsNullOrEmpty(dto.PhotoBucket) && !string.IsNullOrEmpty(dto.PhotoPath))
            citizen.PhotoPath = $"{dto.PhotoBucket}/{dto.PhotoPath}";

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
            DataHash = IdentityHash.Compute(citizen, digitalIdNumber),
            IssuedByOfficerId = actor.OfficerId,
            IssuedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt,
            Status = "active",
            LastNfcCounter = 0,
        };
        // Give the brand-new card an initial mobile PIN so the holder can sign in
        // immediately (without this, PinHash stays null and sign-in-with-pin
        // always fails for a just-issued card). Returned once to the issuing
        // officer to relay to the citizen; only the bcrypt hash persists.
        var pin = AssignNewPin(card);
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

        // Issue the DigitalId VC into the citizen's SSI wallet and stamp the
        // wallet DID on the card. Best-effort — an SSI outage falls back to a
        // placeholder DID and never fails issuance.
        await IssueDigitalIdVcAsync(card, ct);
        await db.SaveChangesAsync(ct);

        await notifications.NotifyCitizenAsync(
            card.CitizenId,
            "تم إصدار بطاقة الهوية الرقمية",
            $"تم إصدار بطاقتك برقم {card.DigitalIdNumber}.",
            new { card_id = card.Id, digital_id_number = card.DigitalIdNumber },
            ct, alsoSms: true);

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
            Pin = pin,
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

        var citizen = await db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == old.CitizenId, ct)
            ?? throw SarhException.NotFound("المواطن", "Citizen");

        // notify:false — reissue sends its own "card reissued" message below; we
        // don't want the holder to also receive a scary "card revoked" message.
        await TransitionAsync(cardId, "revoked", $"إعادة إصدار: {dto.Reason}", actor, "revoked", ct, notify: false);

        var year = DateTime.UtcNow.Year;
        var region = ParseRegionFromDigitalId(old.DigitalIdNumber);
        // Default-mint-new: digital_id_number is NOT NULL UNIQUE at the DB
        // level, and the old card row stays around (revoked) for audit, so
        // reusing the same number would 409. Only keep the old number when
        // the caller is explicit about it AND has freed it first (advanced
        // use; not exercised by default).
        var digitalIdNumber = dto.KeepDigitalIdNumber == true
            ? old.DigitalIdNumber
            : await numbers.NextAsync(region, year, ct);

        var cardSerial = $"LY-{RandomHexUpper(12)}";
        var card = new DigitalIdCard
        {
            Id = Guid.NewGuid(),
            CitizenId = old.CitizenId,
            DigitalIdNumber = digitalIdNumber,
            CardSerial = cardSerial,
            PhotoHash = old.PhotoHash,
            DataHash = IdentityHash.Compute(citizen, digitalIdNumber),
            IssuedByOfficerId = actor.OfficerId,
            IssuedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddYears(5),
            Status = "active",
            LastNfcCounter = 0,
        };
        // A reissued card is a fresh card and needs its own PIN, otherwise the
        // holder can't sign in after a reissue.
        var pin = AssignNewPin(card);
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

        await IssueDigitalIdVcAsync(card, ct);
        await db.SaveChangesAsync(ct);

        await notifications.NotifyCitizenAsync(
            card.CitizenId,
            "تم إعادة إصدار بطاقتك الرقمية",
            $"تم إصدار بطاقة هوية رقمية جديدة لك برقم {card.DigitalIdNumber}. أصبحت بطاقتك السابقة لاغية.",
            new { card_id = card.Id, digital_id_number = card.DigitalIdNumber, reissued = true },
            ct, alsoSms: true);

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
            Pin = pin,
        };
    }

    // ---------------- helpers ----------------
    private async Task<CardView> TransitionAsync(
        Guid cardId, string nextStatus, string reason, CurrentUser actor,
        string historyAction, CancellationToken ct, bool notify = true)
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

        if (!notify) return CardView.From(card);

        // The card holder must be told about a status change to their identity
        // card. Revocation is a critical security event → also push an SMS.
        var (titleAr, bodyAr) = nextStatus == "frozen"
            ? ("تم تجميد بطاقة الهوية الرقمية",
               $"تم تجميد بطاقتك رقم {card.DigitalIdNumber} مؤقتاً." + (string.IsNullOrWhiteSpace(reason) ? "" : $" السبب: {reason}"))
            : ("تم إلغاء بطاقة الهوية الرقمية",
               $"تم إلغاء بطاقتك رقم {card.DigitalIdNumber}." + (string.IsNullOrWhiteSpace(reason) ? "" : $" السبب: {reason}"));
        await notifications.NotifyCitizenAsync(
            card.CitizenId, titleAr, bodyAr,
            new { card_id = card.Id, status = nextStatus, reason },
            ct, alsoSms: nextStatus == "revoked");

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

    // Issues the DigitalId verifiable credential into the citizen's SSI wallet
    // and stamps the wallet DID onto the card. Best-effort: any SSI failure
    // degrades to a placeholder DID so card issuance always completes.
    private async Task IssueDigitalIdVcAsync(DigitalIdCard card, CancellationToken ct)
    {
        try
        {
            var vc = await ssi.IssueDigitalIdVcAsync(card.Id, ct);
            if (vc is not null) card.Did = vc.Did;
            else AttachPlaceholderVc(card);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "SSI DigitalId VC issuance failed for card {CardId}; using placeholder DID.", card.Id);
            AttachPlaceholderVc(card);
        }

        // The SSI DID is the citizen's stable wallet DID, so every card the
        // citizen has ever held resolves to the SAME value — but
        // digital_id_cards.did is UNIQUE (ux_did_cards_did). Keep the DID on the
        // citizen's current card only: release it from any prior (e.g. revoked)
        // card before the caller persists it here, otherwise a reissue collides
        // with the old card's DID and the save 500s. Placeholder DIDs are
        // per-card unique, so this is a harmless no-op for them.
        if (!string.IsNullOrEmpty(card.Did))
            await db.Database.ExecuteSqlRawAsync(
                "UPDATE digital_id_cards SET did = NULL WHERE citizen_id = {0} AND id <> {1} AND did = {2}",
                new object[] { card.CitizenId, card.Id, card.Did }, ct);
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
