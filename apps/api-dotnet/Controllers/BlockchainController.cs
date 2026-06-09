using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Auth;
using Sarh.Api.Blockchain;

namespace Sarh.Api.Controllers;

// Network-level chain diagnostics, independent of any single NFT. Used by the
// admin/officer UI to confirm the API can reach the configured EVM network
// (Infura/Alchemy/etc.) before relying on mint/verify.
[ApiController]
[Route("api/v1/blockchain")]
[Authorize]
public class BlockchainController(IBlockchainService chain) : ControllerBase
{
    [HttpGet("status")]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer", "department_manager")]
    public Task<ChainStatus> Status(CancellationToken ct) => chain.GetStatusAsync(ct);
}
