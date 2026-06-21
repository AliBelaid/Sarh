using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Data;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/audit")]
[Authorize]
[OfficerOnly("super_admin", "auditor")]
public class AuditController(SarhDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<AuditListResponse> List(
        [FromQuery] string? action,
        [FromQuery] string? entity_table,
        [FromQuery] string? actor_kind,
        [FromQuery] string? q,
        [FromQuery] int limit = 50,
        [FromQuery] long? before_id = null,
        CancellationToken ct = default)
    {
        if (limit is < 1 or > 200) limit = 50;

        var query = Filtered(action, entity_table, actor_kind, q);
        if (before_id.HasValue)
            query = query.Where(a => a.Id < before_id.Value);

        var items = await query
            .OrderByDescending(a => a.Id)
            .Take(limit + 1)
            .Select(a => new AuditRow
            {
                Id = a.Id,
                ActorKind = a.ActorKind,
                ActorId = a.ActorId,
                // Resolve a human-readable actor name per actor kind. EF translates
                // these to correlated subqueries; null when the actor is the system
                // or the referenced row was hard-deleted.
                ActorName =
                    a.ActorKind == "officer"
                        ? db.Officers.Where(o => o.Id == a.ActorId).Select(o => o.FullNameAr).FirstOrDefault()
                        : a.ActorKind == "citizen"
                            ? db.Citizens.Where(c => c.Id == a.ActorId).Select(c => c.FullNameAr).FirstOrDefault()
                            : null,
                Action = a.Action,
                EntityTable = a.EntityTable,
                EntityId = a.EntityId,
                IpAddress = a.IpAddress,
                OccurredAt = a.OccurredAt,
            })
            .ToListAsync(ct);

        var hasMore = items.Count > limit;
        if (hasMore) items = items.Take(limit).ToList();

        return new AuditListResponse
        {
            Items = items,
            NextBeforeId = hasMore ? items[^1].Id : null,
        };
    }

    // Lightweight rollup for the audit dashboard header. Cheap because the
    // counts run against the time/entity indexes; the breakdown caps at the
    // distinct action/entity set which is tiny.
    [HttpGet("stats")]
    public async Task<AuditStats> Stats(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var dayAgo = now.AddDays(-1);
        var weekAgo = now.AddDays(-7);

        var total = await db.AuditLog.AsNoTracking().LongCountAsync(ct);
        var last24h = await db.AuditLog.AsNoTracking().LongCountAsync(a => a.OccurredAt >= dayAgo, ct);
        var last7d = await db.AuditLog.AsNoTracking().LongCountAsync(a => a.OccurredAt >= weekAgo, ct);

        var byAction = await db.AuditLog.AsNoTracking()
            .GroupBy(a => a.Action)
            .Select(g => new AuditBreakdown { Key = g.Key, Count = g.LongCount() })
            .OrderByDescending(x => x.Count)
            .ToListAsync(ct);

        var byEntity = await db.AuditLog.AsNoTracking()
            .GroupBy(a => a.EntityTable)
            .Select(g => new AuditBreakdown { Key = g.Key, Count = g.LongCount() })
            .OrderByDescending(x => x.Count)
            .ToListAsync(ct);

        var latestId = await db.AuditLog.AsNoTracking()
            .OrderByDescending(a => a.Id)
            .Select(a => (long?)a.Id)
            .FirstOrDefaultAsync(ct);

        return new AuditStats
        {
            Total = total,
            Last24h = last24h,
            Last7d = last7d,
            LatestId = latestId,
            ByAction = byAction,
            ByEntity = byEntity,
        };
    }

    [HttpGet("{id:long}")]
    public async Task<ActionResult<AuditDetailRow>> Get(long id, CancellationToken ct)
    {
        var entry = await db.AuditLog.AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new AuditDetailRow
            {
                Id = a.Id,
                ActorKind = a.ActorKind,
                ActorId = a.ActorId,
                ActorName =
                    a.ActorKind == "officer"
                        ? db.Officers.Where(o => o.Id == a.ActorId).Select(o => o.FullNameAr).FirstOrDefault()
                        : a.ActorKind == "citizen"
                            ? db.Citizens.Where(c => c.Id == a.ActorId).Select(c => c.FullNameAr).FirstOrDefault()
                            : null,
                Action = a.Action,
                EntityTable = a.EntityTable,
                EntityId = a.EntityId,
                BeforeState = a.BeforeState,
                AfterState = a.AfterState,
                IpAddress = a.IpAddress,
                UserAgent = a.UserAgent,
                OccurredAt = a.OccurredAt,
            })
            .FirstOrDefaultAsync(ct);

        if (entry is null) return NotFound();
        return entry;
    }

    private IQueryable<Data.Entities.AuditLogEntry> Filtered(
        string? action, string? entityTable, string? actorKind, string? q)
    {
        var query = db.AuditLog.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(entityTable))
            query = query.Where(a => a.EntityTable == entityTable);
        if (!string.IsNullOrWhiteSpace(actorKind))
            query = query.Where(a => a.ActorKind == actorKind);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            // Match the entity/action/ip columns AND the resolved actor name
            // (officer or citizen) so searching for a person's name works — the
            // actor name is the most human-meaningful column shown in the table.
            query = query.Where(a =>
                a.EntityTable.Contains(term) ||
                a.Action.Contains(term) ||
                (a.IpAddress != null && a.IpAddress.Contains(term)) ||
                db.Officers.Any(o => o.Id == a.ActorId && o.FullNameAr.Contains(term)) ||
                db.Citizens.Any(c => c.Id == a.ActorId && c.FullNameAr.Contains(term)));
        }

        return query;
    }
}

public class AuditRow
{
    public long Id { get; init; }
    public string ActorKind { get; init; } = "";
    public Guid? ActorId { get; init; }
    public string? ActorName { get; init; }
    public string Action { get; init; } = "";
    public string EntityTable { get; init; } = "";
    public Guid? EntityId { get; init; }
    public string? IpAddress { get; init; }
    public DateTimeOffset OccurredAt { get; init; }
}

public sealed class AuditDetailRow : AuditRow
{
    public string? BeforeState { get; init; }
    public string? AfterState { get; init; }
    public string? UserAgent { get; init; }
}

public sealed class AuditListResponse
{
    public List<AuditRow> Items { get; init; } = [];
    public long? NextBeforeId { get; init; }
}

public sealed class AuditBreakdown
{
    public string Key { get; init; } = "";
    public long Count { get; init; }
}

public sealed class AuditStats
{
    public long Total { get; init; }
    public long Last24h { get; init; }
    public long Last7d { get; init; }
    public long? LatestId { get; init; }
    public List<AuditBreakdown> ByAction { get; init; } = [];
    public List<AuditBreakdown> ByEntity { get; init; } = [];
}
