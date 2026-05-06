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
}
