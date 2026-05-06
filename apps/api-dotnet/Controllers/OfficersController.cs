using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
}
