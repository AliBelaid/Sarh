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
        [FromQuery] int limit = 50,
        [FromQuery] long? before_id = null,
        CancellationToken ct = default)
    {
        if (limit is < 1 or > 200) limit = 50;

        var q = db.AuditLog.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(action))
            q = q.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(entity_table))
            q = q.Where(a => a.EntityTable == entity_table);
        if (!string.IsNullOrWhiteSpace(actor_kind))
            q = q.Where(a => a.ActorKind == actor_kind);
        if (before_id.HasValue)
            q = q.Where(a => a.Id < before_id.Value);

        var items = await q
            .OrderByDescending(a => a.Id)
            .Take(limit + 1)
            .Select(a => new AuditRow
            {
                Id = a.Id,
                ActorKind = a.ActorKind,
                ActorId = a.ActorId,
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
}

public class AuditRow
{
    public long Id { get; init; }
    public string ActorKind { get; init; } = "";
    public Guid? ActorId { get; init; }
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
