using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Properties;
using Sarh.Api.Workflow;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/properties")]
[Authorize]
public class PropertiesController(PropertiesService svc, ReviewService review) : ControllerBase
{
    [HttpPost]
    [Audit(Action = AuditActions.Create, Entity = "properties", EntityIdFrom = "property.id")]
    public Task<SubmitResult> Submit([FromBody] CreatePropertyDto dto, CancellationToken ct)
        => svc.SubmitAsync(dto, User.RequireUser(), ct);

    [HttpGet]
    public Task<CursorPage<PropertyView>> List([FromQuery] ListPropertiesQuery q, CancellationToken ct)
        => svc.ListAsync(q, User.RequireUser(), ct);

    [HttpGet("nearby")]
    public async Task<NearbyResult> Nearby([FromQuery] NearbyQuery q, CancellationToken ct)
        => new NearbyResult { Items = await svc.NearbyAsync(q, ct) };

    [HttpPost("overlap-check")]
    public async Task<OverlapResult> OverlapCheck([FromBody] OverlapCheckDto dto, CancellationToken ct)
        => new OverlapResult { Overlaps = await svc.OverlapCheckAsync(dto, ct) };

    [HttpGet("{id:guid}")]
    public Task<PropertyView> Get(Guid id, CancellationToken ct)
        => svc.GetByIdAsync(id, User.RequireUser(), ct);

    [HttpPost("{id:guid}/review")]
    [Audit(Action = AuditActions.Approve, Entity = "properties", EntityIdFrom = "property.id")]
    public Task<ReviewResult> Review(Guid id, [FromBody] ReviewDecisionDto dto, CancellationToken ct)
        => review.ReviewAsync(id, dto, User.RequireUser(), ct);
}
