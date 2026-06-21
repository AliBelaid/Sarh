using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService
{
    // Edit an issued card. Two safe kinds of change:
    //   • Validity window (expires_at) — feeds no hash, moves freely.
    //   • Civil-identity corrections (Arabic name parts / birth date) — these
    //     live on the citizen and re-derive the tamper-evident data_hash for
    //     every live card the citizen holds (the value bound to the NFC chip).
    // digital_id_number, card_serial and the NFC keys stay immutable. At least
    // one real change is required; 'updated' / 'identity-updated' rows land in
    // id_issuance_history. Officer-only (id_issuer / super_admin).
    public async Task<CardView> UpdateAsync(Guid cardId, UpdateCardDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        // Edits are allowed only while the card is active (enabled). A frozen
        // (stopped), revoked, expired or lost card is read-only — it must be
        // reactivated or reissued before any change.
        if (card.Status != "active")
            throw SarhException.Conflict(
                "لا يمكن تعديل البطاقة إلا وهي نشطة. البطاقات المجمّدة أو الملغاة أو المنتهية أو المفقودة غير قابلة للتعديل.",
                "A card can only be edited while active. Frozen, revoked, expired or lost cards are read-only.");

        var now = DateTimeOffset.UtcNow;
        var reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason!.Trim();

        // 1) Civil-identity corrections. Applied to the citizen; a real change
        //    re-derives data_hash for every live card the citizen holds.
        var identityChanged = false;
        if (dto.HasIdentityEdits)
            identityChanged = await ApplyIdentityEditsAsync(card, dto, actor, reason, now, ct);

        // 2) Validity window. Absolute expiry wins; otherwise derive from
        //    validity years off the issue date.
        var validityChanged = false;
        DateTimeOffset? newExpiry = dto.ExpiresAt
            ?? (dto.ValidityYears is int years ? card.IssuedAt.AddYears(years) : null);

        if (newExpiry is not null)
        {
            if (newExpiry.Value <= now)
                throw SarhException.Validation(
                    "تاريخ الانتهاء يجب أن يكون في المستقبل.",
                    "expires_at must be in the future.");
            if (newExpiry.Value <= card.IssuedAt)
                throw SarhException.Validation(
                    "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.",
                    "expires_at must be after issued_at.");

            if (newExpiry.Value != card.ExpiresAt)
            {
                var oldExpiry = card.ExpiresAt;
                card.ExpiresAt = newExpiry.Value;
                validityChanged = true;
                db.IdIssuanceHistory.Add(new IdIssuanceHistory
                {
                    Id = Guid.NewGuid(),
                    CitizenId = card.CitizenId,
                    CardId = card.Id,
                    Action = "updated",
                    Reason = reason
                        ?? $"تعديل الصلاحية: {oldExpiry:yyyy-MM-dd} ← {newExpiry.Value:yyyy-MM-dd}",
                    OfficerId = actor.OfficerId,
                });
            }
        }

        if (!identityChanged && !validityChanged)
        {
            // Nothing actually moved. If the caller supplied no editable input
            // at all, that's a bad request; otherwise it's a harmless no-op.
            if (newExpiry is null && !dto.HasIdentityEdits)
                throw SarhException.Validation(
                    "لا توجد بيانات للتعديل. حدّد تاريخ انتهاء أو بيانات هوية.",
                    "Nothing to update: provide a validity change or identity fields.");
            return CardView.From(card);
        }

        card.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        // Tell the holder their card data moved. Identity corrections re-hash the
        // chip fingerprint, so those especially warrant a heads-up.
        var bodyAr = identityChanged
            ? $"تم تحديث بيانات هويتك على بطاقتك الرقمية ({card.DigitalIdNumber}). قد يتطلب ذلك مراجعة مكتب الإصدار."
            : $"تم تحديث صلاحية بطاقتك الرقمية ({card.DigitalIdNumber}).";
        await notifications.NotifyCitizenAsync(
            card.CitizenId,
            "تم تحديث بطاقتك الرقمية",
            bodyAr,
            new { card_id = card.Id, identity_changed = identityChanged, validity_changed = validityChanged },
            ct, alsoSms: identityChanged);

        return CardView.From(card);
    }

    // Apply optional name/birth-date corrections to the cardholder's citizen
    // record. Returns true if anything changed (and, if so, re-derives
    // data_hash for all the citizen's live cards). Does NOT save — the caller
    // commits the whole edit in one SaveChanges.
    private async Task<bool> ApplyIdentityEditsAsync(
        DigitalIdCard card, UpdateCardDto dto, CurrentUser actor, string? reason,
        DateTimeOffset now, CancellationToken ct)
    {
        var citizen = await db.Citizens.FirstOrDefaultAsync(x => x.Id == card.CitizenId, ct)
            ?? throw SarhException.NotFound("المواطن", "Citizen");

        // Name parts are required (NOT NULL) — an empty/whitespace value is
        // treated as "no change" so a stray blank can never wipe a name.
        var changed = false;
        if (dto.FirstNameAr?.Trim() is { Length: > 0 } f && f != citizen.FirstNameAr)
        { citizen.FirstNameAr = f; changed = true; }
        if (dto.FatherNameAr?.Trim() is { Length: > 0 } ft && ft != citizen.FatherNameAr)
        { citizen.FatherNameAr = ft; changed = true; }
        if (dto.GrandfatherNameAr?.Trim() is { Length: > 0 } g && g != citizen.GrandfatherNameAr)
        { citizen.GrandfatherNameAr = g; changed = true; }
        if (dto.FamilyNameAr?.Trim() is { Length: > 0 } fam && fam != citizen.FamilyNameAr)
        { citizen.FamilyNameAr = fam; changed = true; }
        if (dto.BirthDate is { } bd)
        {
            var newBirth = bd.ToDateTime(TimeOnly.MinValue);
            if (newBirth != citizen.BirthDate) { citizen.BirthDate = newBirth; changed = true; }
        }

        if (!changed) return false;

        // Keep the denormalised full name in sync with the parts.
        citizen.FullNameAr = string.Join(' ', new[]
        {
            citizen.FirstNameAr, citizen.FatherNameAr,
            citizen.GrandfatherNameAr, citizen.FamilyNameAr,
        }.Where(s => !string.IsNullOrWhiteSpace(s)));
        citizen.UpdatedAt = now;

        // Re-derive the identity fingerprint for every live card. Revoked /
        // expired cards keep their historical hash.
        var liveCards = await db.DigitalIdCards
            .Where(c => c.CitizenId == citizen.Id
                && c.Status != "revoked" && c.Status != "expired")
            .ToListAsync(ct);

        foreach (var lc in liveCards)
        {
            lc.DataHash = IdentityHash.Compute(citizen, lc.DigitalIdNumber);
            lc.UpdatedAt = now;
            db.IdIssuanceHistory.Add(new IdIssuanceHistory
            {
                Id = Guid.NewGuid(),
                CitizenId = citizen.Id,
                CardId = lc.Id,
                Action = "identity-updated",
                Reason = reason
                    ?? "تعديل بيانات الهوية أعاد احتساب بصمة البطاقة (data_hash).",
                OfficerId = actor.OfficerId,
            });
        }

        return true;
    }
}
