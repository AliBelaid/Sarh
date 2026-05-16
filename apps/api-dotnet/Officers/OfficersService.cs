using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Officers;

public sealed class OfficersService(SarhDbContext db)
{
    public async Task<CursorPage<OfficerView>> ListAsync(ListOfficersQuery q, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        IQueryable<Officer> query = db.Officers.AsNoTracking();

        // Region scoping for non-super-admin / non-auditor roles.
        if (actor.Role is not ("super_admin" or "auditor"))
        {
            if (q.RegionId is not null && actor.RegionId is not null && q.RegionId != actor.RegionId)
                throw SarhException.Forbidden("لا يمكنك عرض موظفين من خارج منطقتك.");
            if (actor.RegionId is not null)
                query = query.Where(o => o.RegionId == actor.RegionId);
        }
        else if (q.RegionId is not null)
        {
            query = query.Where(o => o.RegionId == q.RegionId);
        }

        if (q.IsActive is bool active)
            query = query.Where(o => o.IsActive == active);

        if (!string.IsNullOrWhiteSpace(q.Role))
            query = query.Where(o => o.Role == q.Role);

        if (!string.IsNullOrWhiteSpace(q.Cursor) &&
            DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
        {
            query = query.Where(o => o.CreatedAt < cursorTs);
        }

        if (!string.IsNullOrWhiteSpace(q.Q) && q.Q.Trim().Length >= 2)
        {
            var pat = "%" + q.Q.Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
            query = query.Where(o =>
                EF.Functions.Like(o.FullNameAr, pat) ||
                (o.FullNameEn != null && EF.Functions.Like(o.FullNameEn, pat)) ||
                EF.Functions.Like(o.EmployeeNo, pat) ||
                (o.Email != null && EF.Functions.Like(o.Email, pat)) ||
                (o.Phone != null && EF.Functions.Like(o.Phone, pat)));
        }

        var rows = await query
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            var overflow = rows[q.Limit];
            nextCursor = overflow.CreatedAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }

        return new CursorPage<OfficerView>
        {
            Items = rows.Select(OfficerView.From).ToList(),
            NextCursor = nextCursor,
        };
    }

    public async Task<OfficerView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var o = await db.Officers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SarhException.NotFound("الموظف", "Officer");

        if (actor.Role is not ("super_admin" or "auditor")
            && actor.RegionId is not null
            && o.RegionId != actor.RegionId)
        {
            throw SarhException.Forbidden("لا يمكنك عرض موظفين من خارج منطقتك.");
        }

        return OfficerView.From(o);
    }

    private static readonly HashSet<string> ValidRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "super_admin", "registry_officer", "id_issuer", "auditor", "reviewer", "department_manager"
    };

    public async Task<OfficerView> CreateAsync(CreateOfficerRequest req, CancellationToken ct)
    {
        if (!ValidRoles.Contains(req.Role))
            throw SarhException.Validation("الدور غير صالح.", "Invalid role.");

        var email = req.Email.Trim().ToLowerInvariant();
        var exists = await db.AuthUsers.AnyAsync(u => u.Email == email, ct);
        if (exists)
            throw SarhException.Conflict("البريد الإلكتروني مستخدم بالفعل.", "Email already in use.");

        var empExists = await db.Officers.AnyAsync(o => o.EmployeeNo == req.EmployeeNo.Trim(), ct);
        if (empExists)
            throw SarhException.Conflict("رقم الموظف مستخدم بالفعل.", "Employee number already in use.");

        var authUser = new AuthUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            EncryptedPassword = BCrypt.Net.BCrypt.HashPassword(req.Password, 12),
            RawAppMetaData = $"{{\"sarh_role\":\"{req.Role}\"}}",
            RawUserMetaData = "{}",
        };

        var officer = new Officer
        {
            Id = Guid.NewGuid(),
            AuthUserId = authUser.Id,
            EmployeeNo = req.EmployeeNo.Trim(),
            FullNameAr = req.FullNameAr.Trim(),
            FullNameEn = req.FullNameEn?.Trim(),
            Role = req.Role,
            RegionId = req.RegionId,
            MunicipalityId = req.MunicipalityId,
            Phone = req.Phone?.Trim(),
            Email = email,
            Permissions = req.Permissions ?? "{}",
            IsActive = true,
        };

        db.AuthUsers.Add(authUser);
        await db.SaveChangesAsync(ct);

        db.Officers.Add(officer);
        await db.SaveChangesAsync(ct);

        return OfficerView.From(officer);
    }

    public async Task<OfficerView> UpdateAsync(Guid id, UpdateOfficerRequest req, CancellationToken ct)
    {
        var o = await db.Officers.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SarhException.NotFound("الموظف", "Officer");

        if (req.Role is not null && !ValidRoles.Contains(req.Role))
            throw SarhException.Validation("الدور غير صالح.", "Invalid role.");

        if (req.Email is not null)
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var conflict = await db.AuthUsers.AnyAsync(u => u.Email == email && u.Id != o.AuthUserId, ct);
            if (conflict)
                throw SarhException.Conflict("البريد الإلكتروني مستخدم بالفعل.", "Email already in use.");
            o.Email = email;
            var authUser = await db.AuthUsers.FirstOrDefaultAsync(u => u.Id == o.AuthUserId, ct);
            if (authUser is not null) authUser.Email = email;
        }

        if (req.EmployeeNo is not null)
        {
            var empConflict = await db.Officers.AnyAsync(x => x.EmployeeNo == req.EmployeeNo.Trim() && x.Id != id, ct);
            if (empConflict)
                throw SarhException.Conflict("رقم الموظف مستخدم بالفعل.", "Employee number already in use.");
            o.EmployeeNo = req.EmployeeNo.Trim();
        }

        if (req.FullNameAr is not null) o.FullNameAr = req.FullNameAr.Trim();
        if (req.FullNameEn is not null) o.FullNameEn = req.FullNameEn.Trim();
        if (req.Role is not null)
        {
            o.Role = req.Role;
            var authUser = await db.AuthUsers.FirstOrDefaultAsync(u => u.Id == o.AuthUserId, ct);
            if (authUser is not null)
                authUser.RawAppMetaData = $"{{\"sarh_role\":\"{req.Role}\"}}";
        }
        if (req.RegionId is not null) o.RegionId = req.RegionId;
        if (req.MunicipalityId is not null) o.MunicipalityId = req.MunicipalityId;
        if (req.Phone is not null) o.Phone = req.Phone.Trim();
        if (req.Permissions is not null) o.Permissions = req.Permissions;

        await db.SaveChangesAsync(ct);
        return OfficerView.From(o);
    }

    public async Task<OfficerView> SetActiveAsync(Guid id, bool isActive, CancellationToken ct)
    {
        var o = await db.Officers.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SarhException.NotFound("الموظف", "Officer");

        o.IsActive = isActive;
        await db.SaveChangesAsync(ct);
        return OfficerView.From(o);
    }
}
