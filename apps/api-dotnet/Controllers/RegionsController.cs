using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Data;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/regions")]
[AllowAnonymous]
public class RegionsController(SarhDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<RegionView>> List(CancellationToken ct)
    {
        return await db.Regions
            .AsNoTracking()
            .OrderBy(r => r.Code)
            .Select(r => new RegionView(r.Id, r.Code, r.NameAr, r.NameEn))
            .ToListAsync(ct);
    }
}

public record RegionView(int Id, string Code, string NameAr, string? NameEn);
