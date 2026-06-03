using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService
{
    // Edit an issued card's validity window. The card is immutable by design
    // for tamper-evidence — digital_id_number, card_serial, the NFC keys and
    // the identity/photo hashes must never change in place. The ONLY field
    // that can move without breaking that contract is expires_at (it feeds no
    // hash). Identity + photo edits flow through the citizen record, which
    // recomputes data_hash on every live card. Officer-only (id_issuer /
    // super_admin); a 'updated' row lands in id_issuance_history.
    public async Task<CardView> UpdateAsync(Guid cardId, UpdateCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        if (card.Status is "revoked" or "expired")
            throw SarhException.Conflict(
                "لا يمكن تعديل بطاقة ملغاة أو منتهية.",
                "Cannot edit a revoked or expired card.");

        // Absolute expiry wins; otherwise derive from validity years off the
        // issue date. At least one input is required.
        DateTimeOffset? newExpiry = dto.ExpiresAt
            ?? (dto.ValidityYears is int years ? card.IssuedAt.AddYears(years) : null);

        if (newExpiry is null)
            throw SarhException.Validation(
                "حدّد تاريخ انتهاء جديداً أو عدد سنوات الصلاحية.",
                "Provide either expires_at or validity_years.");

        if (newExpiry.Value <= DateTimeOffset.UtcNow)
            throw SarhException.Validation(
                "تاريخ الانتهاء يجب أن يكون في المستقبل.",
                "expires_at must be in the future.");
        if (newExpiry.Value <= card.IssuedAt)
            throw SarhException.Validation(
                "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.",
                "expires_at must be after issued_at.");

        var oldExpiry = card.ExpiresAt;
        if (newExpiry.Value == oldExpiry)
            return CardView.From(card); // no-op — nothing changed

        card.ExpiresAt = newExpiry.Value;
        card.UpdatedAt = DateTimeOffset.UtcNow;

        db.IdIssuanceHistory.Add(new IdIssuanceHistory
        {
            Id = Guid.NewGuid(),
            CitizenId = card.CitizenId,
            CardId = card.Id,
            Action = "updated",
            Reason = string.IsNullOrWhiteSpace(dto.Reason)
                ? $"تعديل الصلاحية: {oldExpiry:yyyy-MM-dd} ← {newExpiry.Value:yyyy-MM-dd}"
                : dto.Reason,
            OfficerId = actor.OfficerId,
        });

        await db.SaveChangesAsync(ct);
        return CardView.From(card);
    }
}
