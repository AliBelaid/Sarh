using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Citizens;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Storage;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/citizens")]
[Authorize]
public class CitizensController(CitizensService svc, SarhDbContext db, StorageService storage) : ControllerBase
{
    [HttpPost]
    [OfficerOnly("id_issuer", "registry_officer", "super_admin")]
    [Audit(Action = AuditActions.Create, Entity = "citizens")]
    public Task<CitizenView> Create([FromBody] CreateCitizenDto dto, CancellationToken ct)
        => svc.CreateAsync(dto, User.RequireUser(), ct);

    [HttpGet]
    [OfficerOnly("id_issuer", "registry_officer", "super_admin", "auditor", "reviewer")]
    public Task<CursorPage<CitizenView>> List([FromQuery] ListCitizensQuery q, CancellationToken ct)
        => svc.ListAsync(q, User.RequireUser(), ct);

    [HttpGet("{id:guid}")]
    public Task<CitizenView> Get(Guid id, CancellationToken ct)
        => svc.GetByIdAsync(id, User.RequireUser(), ct);

    [HttpPatch("{id:guid}")]
    [OfficerOnly("id_issuer", "registry_officer", "super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "citizens")]
    public Task<CitizenView> Update(Guid id, [FromBody] UpdateCitizenDto dto, CancellationToken ct)
        => svc.UpdateAsync(id, dto, User.RequireUser(), ct);

    // Streams the citizen's portrait. Citizens may fetch their own; officers may fetch any.
    [HttpGet("{id:guid}/photo")]
    public async Task<IActionResult> GetPhoto(Guid id, CancellationToken ct)
    {
        var actor = User.RequireUser();
        if (actor.Role == "citizen" && actor.CitizenId != id) throw SarhException.Forbidden();

        var citizen = await db.Citizens.AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new { c.PhotoPath })
            .FirstOrDefaultAsync(ct)
            ?? throw SarhException.NotFound("المواطن", "Citizen");
        if (string.IsNullOrEmpty(citizen.PhotoPath))
            throw SarhException.NotFound("الصورة", "Photo");

        // photo_path is stored as "<bucket>/<rest-of-path>".
        var slash = citizen.PhotoPath.IndexOf('/');
        if (slash < 0) throw SarhException.NotFound("الصورة", "Photo");
        var bucket = citizen.PhotoPath[..slash];
        var path = citizen.PhotoPath[(slash + 1)..];

        var stream = storage.OpenRead(bucket, path);
        var contentType = path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? "image/png"
            : path.EndsWith(".webp", StringComparison.OrdinalIgnoreCase) ? "image/webp"
            : "image/jpeg";
        Response.Headers.CacheControl = "private, max-age=300";
        return File(stream, contentType);
    }
}
