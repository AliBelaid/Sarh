using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Data;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
[Authorize]
[OfficerOnly("super_admin", "auditor", "department_manager")]
public class ReportsController(SarhDbContext db) : ControllerBase
{
    [HttpGet("trends")]
    public async Task<TrendsResponse> Trends([FromQuery] int days = 30, CancellationToken ct = default)
    {
        if (days is < 7 or > 90) days = 30;
        var since = DateTimeOffset.UtcNow.AddDays(-days);

        var submitted = await db.Properties
            .Where(p => p.SubmittedAt >= since)
            .GroupBy(p => p.SubmittedAt!.Value.Date)
            .Select(g => new DayCount { Date = g.Key.ToString("yyyy-MM-dd"), Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);

        var approved = await db.Properties
            .Where(p => p.FinalApprovedAt >= since)
            .GroupBy(p => p.FinalApprovedAt!.Value.Date)
            .Select(g => new DayCount { Date = g.Key.ToString("yyyy-MM-dd"), Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);

        var cards = await db.DigitalIdCards
            .Where(c => c.IssuedAt >= since)
            .GroupBy(c => c.IssuedAt.Date)
            .Select(g => new DayCount { Date = g.Key.ToString("yyyy-MM-dd"), Count = g.Count() })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);

        return new TrendsResponse
        {
            Days = days,
            Submitted = submitted,
            Approved = approved,
            CardsIssued = cards,
        };
    }

    [HttpGet("summary")]
    public async Task<SummaryResponse> Summary(CancellationToken ct)
    {
        var totalProps = await db.Properties.CountAsync(ct);
        var approved = await db.Properties.CountAsync(p => p.Status == "approved" || p.Status == "minted", ct);
        var pending = await db.Properties.CountAsync(p => p.Status == "pending" || p.Status == "under_review", ct);
        var rejected = await db.Properties.CountAsync(p => p.Status == "rejected", ct);
        var citizens = await db.Citizens.CountAsync(ct);
        var activeCards = await db.DigitalIdCards.CountAsync(c => c.Status == "active", ct);
        var officers = await db.Officers.CountAsync(o => o.IsActive, ct);

        return new SummaryResponse
        {
            TotalProperties = totalProps,
            ApprovedProperties = approved,
            PendingProperties = pending,
            RejectedProperties = rejected,
            TotalCitizens = citizens,
            ActiveCards = activeCards,
            ActiveOfficers = officers,
        };
    }
}

public class DayCount
{
    public string Date { get; set; } = "";
    public int Count { get; set; }
}

public class TrendsResponse
{
    public int Days { get; set; }
    public List<DayCount> Submitted { get; set; } = [];
    public List<DayCount> Approved { get; set; } = [];
    public List<DayCount> CardsIssued { get; set; } = [];
}

public class SummaryResponse
{
    public int TotalProperties { get; set; }
    public int ApprovedProperties { get; set; }
    public int PendingProperties { get; set; }
    public int RejectedProperties { get; set; }
    public int TotalCitizens { get; set; }
    public int ActiveCards { get; set; }
    public int ActiveOfficers { get; set; }
}
