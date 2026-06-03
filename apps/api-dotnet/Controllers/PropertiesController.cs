using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Map;
using Sarh.Api.Properties;
using Sarh.Api.Storage;
using Sarh.Api.Workflow;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/properties")]
[Authorize]
public class PropertiesController(
    PropertiesService svc, ReviewService review, LicenseService license,
    MapService map, StorageService storageReader) : ControllerBase
{
    // Officer map feed — every live parcel in the actor's region scope
    // (region-scoped roles see only their own region; admins/managers may
    // pass ?region_id=). Includes parcels still in the workflow so an officer
    // sees pending requests (yellow) alongside issued deeds. PUBLIC attributes
    // only — no owner / national number leaves here either.
    [HttpGet("map")]
    [OfficerOnly("registry_officer", "reviewer", "department_manager", "super_admin", "auditor", "id_issuer")]
    public Task<MapFeatureCollection> Map([FromQuery(Name = "region_id")] int? regionId, CancellationToken ct)
        => map.OfficerMapAsync(User.RequireUser(), regionId, ct);

    [HttpPost]
    [EnableRateLimiting(RateLimitPolicies.Write)]
    [Audit(Action = AuditActions.Create, Entity = "properties", EntityIdFrom = "property.id")]
    public Task<SubmitResult> Submit([FromBody] CreatePropertyDto dto, CancellationToken ct)
        => svc.SubmitAsync(dto, User.RequireUser(), ct);

    [HttpGet]
    public Task<CursorPage<PropertyView>> List([FromQuery] ListPropertiesQuery filters, CancellationToken ct)
        => svc.ListAsync(filters, User.RequireUser(), ct);

    [HttpGet("nearby")]
    public async Task<NearbyResult> Nearby([FromQuery] NearbyQuery q, CancellationToken ct)
        => new NearbyResult { Items = await svc.NearbyAsync(q, ct) };

    [HttpPost("overlap-check")]
    public async Task<OverlapResult> OverlapCheck([FromBody] OverlapCheckDto dto, CancellationToken ct)
        => new OverlapResult { Overlaps = await svc.OverlapCheckAsync(dto, ct) };

    [HttpGet("{id:guid}")]
    public Task<PropertyView> Get(Guid id, CancellationToken ct)
        => svc.GetByIdAsync(id, User.RequireUser(), ct);

    // Attached evidence (site photos + koreky sketch). Owner or in-region officer.
    [HttpGet("{id:guid}/documents")]
    public async Task<DocumentsResult> Documents(Guid id, CancellationToken ct)
        => new DocumentsResult { Items = await svc.ListDocumentsAsync(id, User.RequireUser(), ct) };

    [HttpGet("{id:guid}/documents/{docId:guid}/file")]
    public async Task<IActionResult> DocumentFile(Guid id, Guid docId, CancellationToken ct)
    {
        var (bucket, path, mime) = await svc.ResolveDocumentFileAsync(id, docId, User.RequireUser(), ct);
        var stream = storageReader.OpenRead(bucket, path);
        Response.Headers.CacheControl = "private, max-age=300";
        return File(stream, mime ?? "application/octet-stream");
    }

    // Redraw a parcel's boundary polygon. Area + centroid are recomputed
    // server-side. Officer (own region) / super_admin, or the owning citizen
    // while the parcel is still in the workflow — enforced in the service.
    [HttpPatch("{id:guid}/boundary")]
    [Audit(Action = AuditActions.Update, Entity = "properties", EntityIdFrom = "id")]
    public Task<PropertyView> UpdateBoundary(Guid id, [FromBody] UpdateBoundaryDto dto, CancellationToken ct)
        => svc.UpdateBoundaryAsync(id, dto, User.RequireUser(), ct);

    [HttpPost("{id:guid}/review")]
    [Audit(Action = AuditActions.Approve, Entity = "properties", EntityIdFrom = "property.id")]
    public Task<ReviewResult> Review(Guid id, [FromBody] ReviewDecisionDto dto, CancellationToken ct)
        => review.ReviewAsync(id, dto, User.RequireUser(), ct);

    // Final approval — mints the on-chain NFT licence on top of an
    // officer-approved property. Originally department_manager/super_admin
    // only; opened to any authenticated role per product decision. The
    // service enforces region scope for officers and ownership for citizens.
    [HttpPost("{id:guid}/final-approve")]
    [Audit(Action = AuditActions.Approve, Entity = "properties", EntityIdFrom = "property.id")]
    public Task<LicenseResult> FinalApprove(Guid id, [FromBody] FinalApproveDto dto, CancellationToken ct)
        => license.FinalApproveAsync(id, dto, User.RequireUser(), ct);

    [HttpPost("bulk-review")]
    [OfficerOnly("registry_officer", "reviewer", "super_admin")]
    public async Task<BulkResultResponse> BulkReview([FromBody] BulkReviewRequest req, CancellationToken ct)
    {
        var actor = User.RequireUser();
        var results = new List<BulkItemResult>();
        foreach (var id in req.PropertyIds.Distinct().Take(50))
        {
            try
            {
                var dto = new ReviewDecisionDto
                {
                    Decision = req.Decision,
                    Note = req.Note,
                    ApprovalDecreeNo = req.ApprovalDecreeNo,
                };
                await review.ReviewAsync(id, dto, actor, ct);
                results.Add(new BulkItemResult { Id = id, Success = true });
            }
            catch (Exception ex)
            {
                results.Add(new BulkItemResult { Id = id, Success = false, Error = ex.Message });
            }
        }
        return new BulkResultResponse { Results = results };
    }

    [HttpPost("bulk-final-approve")]
    [OfficerOnly("department_manager", "super_admin")]
    public async Task<BulkResultResponse> BulkFinalApprove([FromBody] BulkFinalApproveRequest req, CancellationToken ct)
    {
        var actor = User.RequireUser();
        var results = new List<BulkItemResult>();
        foreach (var id in req.PropertyIds.Distinct().Take(20))
        {
            try
            {
                var dto = new FinalApproveDto { Note = req.Note };
                await license.FinalApproveAsync(id, dto, actor, ct);
                results.Add(new BulkItemResult { Id = id, Success = true });
            }
            catch (Exception ex)
            {
                results.Add(new BulkItemResult { Id = id, Success = false, Error = ex.Message });
            }
        }
        return new BulkResultResponse { Results = results };
    }
}

public sealed class DocumentsResult
{
    public required IReadOnlyList<PropertyDocumentView> Items { get; init; }
}

public sealed class BulkReviewRequest
{
    public required List<Guid> PropertyIds { get; set; }
    public required string Decision { get; set; }
    public string? Note { get; set; }
    public string? ApprovalDecreeNo { get; set; }
}

public sealed class BulkFinalApproveRequest
{
    public required List<Guid> PropertyIds { get; set; }
    public string? Note { get; set; }
}

public sealed class BulkItemResult
{
    public Guid Id { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
}

public sealed class BulkResultResponse
{
    public required List<BulkItemResult> Results { get; set; }
    public int SuccessCount => Results.Count(r => r.Success);
    public int FailedCount => Results.Count(r => !r.Success);
}
