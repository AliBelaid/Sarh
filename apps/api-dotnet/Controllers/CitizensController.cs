using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sijilli.Api.Audit;
using Sijilli.Api.Auth;
using Sijilli.Api.Citizens;
using Sijilli.Api.Common;

namespace Sijilli.Api.Controllers;

[ApiController]
[Route("api/v1/citizens")]
[Authorize]
public class CitizensController(CitizensService svc) : ControllerBase
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
}
