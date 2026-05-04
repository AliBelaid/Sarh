using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Auth;
using Sijilli.Api.Common;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;
using Sijilli.Api.Data.Entities;

namespace Sijilli.Api.Citizens;

public sealed class CitizensService(SijilliDbContext db)
{
    private const int UNIQUE_VIOLATION = 2627;
    private const int UNIQUE_VIOLATION_INDEX = 2601;

    public async Task<CitizenView> CreateAsync(CreateCitizenDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SijilliException.Forbidden();

        var c = new Citizen
        {
            Id = Guid.NewGuid(),
            FirstNameAr = dto.FirstNameAr,
            FatherNameAr = dto.FatherNameAr,
            GrandfatherNameAr = dto.GrandfatherNameAr,
            FamilyNameAr = dto.FamilyNameAr,
            FirstNameEn = dto.FirstNameEn,
            FatherNameEn = dto.FatherNameEn,
            GrandfatherNameEn = dto.GrandfatherNameEn,
            FamilyNameEn = dto.FamilyNameEn,
            MotherNameAr = dto.MotherNameAr,
            LegacyNationalNo = dto.LegacyNationalNo,
            FamilyBookNo = dto.FamilyBookNo,
            Gender = dto.Gender,
            BirthDate = dto.BirthDate.ToDateTime(TimeOnly.MinValue),
            BirthPlace = dto.BirthPlace,
            MaritalStatus = dto.MaritalStatus,
            Phone = dto.Phone,
            Email = dto.Email?.ToLowerInvariant(),
            RegionId = dto.RegionId,
            MunicipalityId = dto.MunicipalityId,
            AddressAr = dto.AddressAr,
            PhotoPath = dto.PhotoPath,
            SignaturePath = dto.SignaturePath,
            CreatedBy = actor.OfficerId,
            IsActive = true,
        };

        db.Citizens.Add(c);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw SijilliException.Conflict(
                "يوجد مواطن مسجّل مسبقاً برقم وطني أو هاتف أو بريد إلكتروني مماثل.",
                "A citizen already exists with the same national/phone/email.");
        }
        return CitizenView.From(c);
    }

    public async Task<CursorPage<CitizenView>> ListAsync(ListCitizensQuery q, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SijilliException.Forbidden();

        IQueryable<Citizen> query = db.Citizens.AsNoTracking().Where(c => c.IsActive);

        // Region scoping for non-super-admin / non-auditor roles.
        if (actor.Role is not ("super_admin" or "auditor"))
        {
            if (q.RegionId is not null && actor.RegionId is not null && q.RegionId != actor.RegionId)
                throw SijilliException.Forbidden("لا يمكنك عرض مواطنين من خارج منطقتك.");
            if (actor.RegionId is not null)
                query = query.Where(c => c.RegionId == actor.RegionId);
        }
        else if (q.RegionId is not null)
        {
            query = query.Where(c => c.RegionId == q.RegionId);
        }

        if (!string.IsNullOrWhiteSpace(q.Cursor) &&
            DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
        {
            query = query.Where(c => c.CreatedAt < cursorTs);
        }

        if (!string.IsNullOrWhiteSpace(q.Q) && q.Q.Trim().Length >= 2)
        {
            // Arabic_CI_AS collation makes LIKE case-insensitive for Latin
            // and accent-insensitive for Arabic. Escape % and _.
            var pat = "%" + q.Q.Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
            query = query.Where(c =>
                EF.Functions.Like(c.FirstNameAr, pat) ||
                EF.Functions.Like(c.FatherNameAr, pat) ||
                EF.Functions.Like(c.FamilyNameAr, pat));
        }

        var rows = await query
            .OrderByDescending(c => c.CreatedAt)
            .ThenByDescending(c => c.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            var overflow = rows[q.Limit];
            nextCursor = overflow.CreatedAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }

        return new CursorPage<CitizenView>
        {
            Items = rows.Select(CitizenView.From).ToList(),
            NextCursor = nextCursor,
        };
    }

    public async Task<CitizenView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)
    {
        if (actor.Role == "citizen" && actor.CitizenId != id) throw SijilliException.Forbidden();

        var c = await db.Citizens.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SijilliException.NotFound("المواطن", "Citizen");
        return CitizenView.From(c);
    }

    public async Task<CitizenView> UpdateAsync(Guid id, UpdateCitizenDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SijilliException.Forbidden();

        var c = await db.Citizens.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SijilliException.NotFound("المواطن", "Citizen");

        if (dto.FirstNameEn is not null) c.FirstNameEn = dto.FirstNameEn;
        if (dto.FatherNameEn is not null) c.FatherNameEn = dto.FatherNameEn;
        if (dto.GrandfatherNameEn is not null) c.GrandfatherNameEn = dto.GrandfatherNameEn;
        if (dto.FamilyNameEn is not null) c.FamilyNameEn = dto.FamilyNameEn;
        if (dto.MotherNameAr is not null) c.MotherNameAr = dto.MotherNameAr;
        if (dto.LegacyNationalNo is not null) c.LegacyNationalNo = dto.LegacyNationalNo;
        if (dto.FamilyBookNo is not null) c.FamilyBookNo = dto.FamilyBookNo;
        if (dto.BirthPlace is not null) c.BirthPlace = dto.BirthPlace;
        if (dto.MaritalStatus is not null) c.MaritalStatus = dto.MaritalStatus;
        if (dto.Phone is not null) c.Phone = dto.Phone;
        if (dto.Email is not null) c.Email = dto.Email.ToLowerInvariant();
        if (dto.RegionId is not null) c.RegionId = dto.RegionId;
        if (dto.MunicipalityId is not null) c.MunicipalityId = dto.MunicipalityId;
        if (dto.AddressAr is not null) c.AddressAr = dto.AddressAr;
        if (dto.PhotoPath is not null) c.PhotoPath = dto.PhotoPath;
        if (dto.SignaturePath is not null) c.SignaturePath = dto.SignaturePath;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            throw SijilliException.Conflict(
                "تعارض في رقم الهاتف أو البريد الإلكتروني.",
                "Conflict on phone or email.");
        }
        return CitizenView.From(c);
    }

    private static bool IsUnique(DbUpdateException ex) =>
        ex.InnerException is SqlException se &&
        (se.Number == UNIQUE_VIOLATION || se.Number == UNIQUE_VIOLATION_INDEX);
}
