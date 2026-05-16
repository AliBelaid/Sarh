using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Officers;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/officers")]
[Authorize]
public class OfficersController(OfficersService svc) : ControllerBase
{
    [HttpGet]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer")]
    public Task<CursorPage<OfficerView>> List([FromQuery] ListOfficersQuery q, CancellationToken ct)
        => svc.ListAsync(q, User.RequireUser(), ct);

    [HttpGet("{id:guid}")]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer")]
    public Task<OfficerView> Get(Guid id, CancellationToken ct)
        => svc.GetByIdAsync(id, User.RequireUser(), ct);

    [HttpPost]
    [OfficerOnly("super_admin")]
    [Audit(Action = AuditActions.Create, Entity = "officers")]
    public Task<OfficerView> Create([FromBody] CreateOfficerRequest req, CancellationToken ct)
        => svc.CreateAsync(req, ct);

    [HttpPatch("{id:guid}")]
    [OfficerOnly("super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "officers")]
    public Task<OfficerView> Update(Guid id, [FromBody] UpdateOfficerRequest req, CancellationToken ct)
        => svc.UpdateAsync(id, req, ct);

    [HttpPost("{id:guid}/set-active")]
    [OfficerOnly("super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "officers")]
    public Task<OfficerView> SetActive(Guid id, [FromBody] SetOfficerActiveRequest req, CancellationToken ct)
        => svc.SetActiveAsync(id, req.IsActive, ct);

    [HttpPost("{id:guid}/reset-password")]
    [OfficerOnly("super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "officers", CaptureRequestBody = false)]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        await svc.ResetPasswordAsync(id, req.NewPassword, ct);
        return Ok(new { success = true });
    }
}
