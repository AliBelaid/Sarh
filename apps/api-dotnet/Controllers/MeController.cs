using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Auth;
using Sarh.Api.Workflow;

namespace Sarh.Api.Controllers;

// Citizen-scoped read endpoints. The "me" prefix avoids the
// citizen-id-in-the-path footgun (where a citizen sniffs another's id and
// tries to fetch their data) — the authenticated subject is always the
// authoritative source.
[ApiController]
[Route("api/v1/me")]
[Authorize]
public class MeController(NftsService nfts) : ControllerBase
{
    [HttpGet("nft-licences")]
    public Task<List<NftLicenseView>> MyLicences(CancellationToken ct)
        => nfts.ListMyAsync(User.RequireUser(), ct);
}
