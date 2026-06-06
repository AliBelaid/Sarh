using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService
{
    // Hard delete: super_admin-only. Physically removes the card from the
    // database rather than soft-revoking it. Its NFC key material
    // (nfc_card_secrets, ON DELETE CASCADE) and its issuance-history rows
    // (id_issuance_history — a non-cascading FK that must be cleared first)
    // are removed, then the card row itself, all in one transaction. The
    // deletion is still captured in the append-only audit_log by the
    // controller's [Audit] filter; the card row itself is NOT retained.
    public async Task<DeleteCardResult> DeleteAsync(Guid cardId, DeleteCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.Role != "super_admin" || actor.OfficerId is null)
            throw SarhException.Forbidden("حذف الهوية الرقمية متاح للمسؤول العام فقط.");

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        var citizenId = card.CitizenId;
        var didNumber = card.DigitalIdNumber;
        var wasLive = card.Status is "active" or "frozen";

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // 1) Issuance history references the card via a non-cascading FK, so it
        //    has to go before the card row or the DELETE would violate the FK.
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM id_issuance_history WHERE card_id = @id",
            new object[] { new SqlParameter("@id", cardId) }, ct);

        // 2) NFC key material. The FK is ON DELETE CASCADE, but delete it
        //    explicitly so we can report how many secret rows were purged.
        var secretRows = await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM nfc_card_secrets WHERE card_id = @id",
            new object[] { new SqlParameter("@id", cardId) }, ct);

        // 3) The card row itself.
        db.DigitalIdCards.Remove(card);
        await db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        log.LogWarning(
            "Digital ID card {CardId} (digital_id_number={Did}) HARD-DELETED by super_admin {OfficerId}. " +
            "NFC secrets purged: {N}. Reason: {Reason}.",
            cardId, didNumber, actor.OfficerId, secretRows,
            string.IsNullOrWhiteSpace(dto.Reason) ? "(none)" : dto.Reason);

        if (wasLive)
        {
            await notifications.NotifyCitizenAsync(
                citizenId,
                "تم حذف بطاقة الهوية الرقمية",
                $"تم حذف بطاقتك رقم {didNumber} نهائياً. للاستفسار، تواصل مع مكتب الإصدار.",
                new { card_id = cardId, digital_id_number = didNumber, action = "deleted" },
                ct);
        }

        return new DeleteCardResult
        {
            CardId = cardId,
            DigitalIdNumber = didNumber,
            CitizenId = citizenId,
            Deleted = true,
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
    // Hard delete: the card row, its NFC secrets and its issuance history are
    // physically removed from the database.
    public required bool Deleted { get; init; }
    public required int NfcSecretsPurged { get; init; }
}
