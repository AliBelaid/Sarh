using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService
{
    // Hard-revoke + scrub: super_admin-only. Sets status=revoked, clears the
    // PIN hash and NFC secrets so the card cannot be replayed, drops the
    // matching nfc_card_secrets row, and writes a 'deleted' issuance-history
    // entry. The card row itself is kept for audit (CASCADE on citizen would
    // otherwise erase the trail).
    public async Task<DeleteCardResult> DeleteAsync(Guid cardId, DeleteCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.Role != "super_admin" || actor.OfficerId is null)
            throw SarhException.Forbidden("حذف الهوية الرقمية متاح للمسؤول العام فقط.");

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        var citizenId = card.CitizenId;
        var didNumber = card.DigitalIdNumber;
        var wasActive = card.Status is "active" or "frozen";

        card.Status = "revoked";
        card.RevokedAt = DateTimeOffset.UtcNow;
        card.RevokedReason = string.IsNullOrWhiteSpace(dto.Reason)
            ? "حذف الهوية الرقمية بواسطة المسؤول العام"
            : dto.Reason!;
        card.PinHash = null;
        card.PinSetAt = null;
        card.NfcUid = null;
        card.NfcSignatureKeyId = null;
        card.UpdatedAt = DateTimeOffset.UtcNow;

        db.IdIssuanceHistory.Add(new IdIssuanceHistory
        {
            Id = Guid.NewGuid(),
            CitizenId = citizenId,
            CardId = card.Id,
            Action = "deleted",
            Reason = card.RevokedReason,
            OfficerId = actor.OfficerId,
        });

        await db.SaveChangesAsync(ct);

        // Drop the NFC key material so a found/cloned card can't replay.
        var secretRows = await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM nfc_card_secrets WHERE card_id = @id",
            new object[] { new SqlParameter("@id", cardId) }, ct);

        log.LogWarning(
            "Digital ID card {CardId} (digital_id_number={Did}) deleted by super_admin {OfficerId}. " +
            "NFC secrets purged: {N}.",
            cardId, didNumber, actor.OfficerId, secretRows);

        if (wasActive)
        {
            await notifications.NotifyCitizenAsync(
                citizenId,
                "تم حذف بطاقة الهوية الرقمية",
                $"تم حذف بطاقتك رقم {didNumber}. للاستفسار، تواصل مع مكتب الإصدار.",
                new { card_id = cardId, digital_id_number = didNumber, action = "deleted" },
                ct);
        }

        return new DeleteCardResult
        {
            CardId = cardId,
            DigitalIdNumber = didNumber,
            CitizenId = citizenId,
            Status = card.Status,
            RevokedAt = card.RevokedAt.Value,
            NfcSecretsPurged = secretRows,
        };
    }
}

public sealed class DeleteCardDto
{
    public string? Reason { get; set; }
}

public sealed class DeleteCardResult
{
    public required Guid CardId { get; init; }
    public required string DigitalIdNumber { get; init; }
    public required Guid CitizenId { get; init; }
    public required string Status { get; init; }
    public required DateTimeOffset RevokedAt { get; init; }
    public required int NfcSecretsPurged { get; init; }
}
