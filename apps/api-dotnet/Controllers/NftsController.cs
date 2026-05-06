using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Workflow;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/property-nfts")]
[Authorize]
public class NftsController(NftsService svc, TransferService transferSvc) : ControllerBase
{
    [HttpGet]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer", "department_manager")]
    public Task<CursorPage<NftLicenseView>> List([FromQuery] ListNftsQuery q, CancellationToken ct)
        => svc.ListAsync(q, User.RequireUser(), ct);

    [HttpGet("{id:guid}")]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer", "department_manager")]
    public Task<NftLicenseView> Get(Guid id, CancellationToken ct)
        => svc.GetByIdAsync(id, User.RequireUser(), ct);

    [HttpGet("{id:guid}/history")]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer", "department_manager")]
    public Task<List<OwnershipEventView>> History(Guid id, CancellationToken ct)
        => svc.ListHistoryAsync(id, User.RequireUser(), ct);

    // Re-assigns the NFT to a different citizen. Updates ownership_history,
    // property_nfts, and properties.owner_citizen_id atomically (DB side);
    // the chain call is best-effort against the registry's records.
    [HttpPost("{id:guid}/transfer")]
    [OfficerOnly("super_admin", "department_manager", "registry_officer")]
    [Audit(Action = AuditActions.Update, Entity = "property_nfts", EntityIdFrom = "nft.id")]
    public Task<TransferResult> Transfer(Guid id, [FromBody] TransferNftDto dto, CancellationToken ct)
        => transferSvc.TransferAsync(id, dto, User.RequireUser(), ct);
}
