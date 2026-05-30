using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Disputes;

// Records and lifts legal encumbrances (court seizures, mortgages, waqf, …)
// on parcels, and exposes the authoritative "is this parcel encumbered?"
// gate that LicenseService (mint) and TransferService (sale) call before
// they let a parcel move. An active dispute is a hard block on those two
// paths — the registry must never sell or mint an encumbered parcel.
public sealed class DisputesService(SarhDbContext db)
{
    // Who may record an encumbrance vs. who may release one. Releasing is the
    // more sensitive act (it re-opens sale/mint), so it's the narrower set.
    private static readonly HashSet<string> RecordRoles = ["super_admin", "department_manager", "registry_officer"];
    private static readonly HashSet<string> LiftRoles   = ["super_admin", "department_manager"];

    // ── The security gate ────────────────────────────────────────────────
    public Task<bool> HasActiveDisputeAsync(Guid propertyId, CancellationToken ct) =>
        db.PropertyDisputes.AsNoTracking()
            .AnyAsync(d => d.PropertyId == propertyId && d.Status == "active", ct);

    // Throws ERR_CONFLICT if the parcel has any active encumbrance. Called by
    // the mint and transfer paths.
    public async Task AssertNoActiveDisputeAsync(Guid propertyId, CancellationToken ct)
    {
        var active = await db.PropertyDisputes.AsNoTracking()
            .Where(d => d.PropertyId == propertyId && d.Status == "active")
            .OrderBy(d => d.StartDate)
            .FirstOrDefaultAsync(ct);

        if (active is null) return;

        throw SarhException.Conflict(
            $"لا يمكن إتمام العملية: العقار عليه {DisputeLabels.TypeAr(active.DisputeType)} قائم " +
            $"من جهة \"{active.IssuingAuthority}\". يجب رفع الحجز أولاً.",
            $"Property has an active encumbrance ('{active.DisputeType}' by " +
            $"'{active.IssuingAuthority}'). Lift it before selling or minting.");
    }

    // ── CRUD for officers ────────────────────────────────────────────────
    public async Task<DisputeView> RecordAsync(RecordDisputeDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is not Guid officerId || !RecordRoles.Contains(actor.Role))
            throw SarhException.Forbidden("تسجيل الحجوزات والنزاعات مقصور على موظفي السجل والإدارة.");

        if (!DisputeLabels.Types.ContainsKey(dto.DisputeType))
            throw SarhException.Validation(
                "نوع الحجز/النزاع غير صالح.",
                $"Invalid dispute_type '{dto.DisputeType}'.");

        if (string.IsNullOrWhiteSpace(dto.IssuingAuthority))
            throw SarhException.Validation("الجهة الصادرة إلزامية.", "issuing_authority is required.");

        if (dto.EndDate is DateOnly end && end < dto.StartDate)
            throw SarhException.Validation(
                "تاريخ الانتهاء يسبق تاريخ البدء.",
                "end_date is before start_date.");

        var property = await db.Properties.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == dto.PropertyId, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        EnsureRegionScope(actor, property.RegionId);

        var dispute = new PropertyDispute
        {
            Id = Guid.NewGuid(),
            PropertyId = property.Id,
            DisputeType = dto.DisputeType,
            CaseNumber = dto.CaseNumber?.Trim(),
            IssuingAuthority = dto.IssuingAuthority.Trim(),
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Status = "active",
            Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
            RecordedByOfficerId = officerId,
        };
        db.PropertyDisputes.Add(dispute);
        await db.SaveChangesAsync(ct);

        return DisputeView.From(dispute, property.PropertyCode);
    }

    public async Task<DisputeView> LiftAsync(Guid id, LiftDisputeDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is not Guid officerId || !LiftRoles.Contains(actor.Role))
            throw SarhException.Forbidden("رفع الحجز مقصور على مدير الإدارة أو المدير العام.");

        var dispute = await db.PropertyDisputes.FirstOrDefaultAsync(d => d.Id == id, ct)
            ?? throw SarhException.NotFound("سجل الحجز/النزاع", "Dispute record");

        if (dispute.Status == "lifted")
            throw SarhException.Conflict("الحجز مرفوع بالفعل.", "Dispute is already lifted.");

        var property = await db.Properties.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == dispute.PropertyId, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        EnsureRegionScope(actor, property.RegionId);

        dispute.Status = "lifted";
        dispute.LiftedByOfficerId = officerId;
        dispute.LiftedAt = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(dto.Notes))
            dispute.Notes = string.IsNullOrWhiteSpace(dispute.Notes)
                ? dto.Notes.Trim()
                : $"{dispute.Notes}\n— رفع الحجز: {dto.Notes.Trim()}";

        await db.SaveChangesAsync(ct);
        return DisputeView.From(dispute, property.PropertyCode);
    }

    // All disputes for one parcel (active + historical), newest first.
    public async Task<List<DisputeView>> ListByPropertyAsync(Guid propertyId, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var property = await db.Properties.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == propertyId, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        EnsureRegionScope(actor, property.RegionId);

        var rows = await db.PropertyDisputes.AsNoTracking()
            .Where(d => d.PropertyId == propertyId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(d => DisputeView.From(d, property.PropertyCode)).ToList();
    }

    // Officers can only act within their region; super_admin / auditor are
    // unscoped. Mirrors the rule used across the workflow services.
    private static void EnsureRegionScope(CurrentUser actor, int? propertyRegionId)
    {
        if (actor.Role is "super_admin" or "auditor") return;
        if (actor.RegionId is int aRegion && propertyRegionId is int pRegion && aRegion != pRegion)
            throw SarhException.Forbidden("العقار خارج منطقتك.");
    }
}
