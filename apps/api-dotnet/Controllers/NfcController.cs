using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sijilli.Api.Audit;
using Sijilli.Api.Auth;
using Sijilli.Api.Nfc;

namespace Sijilli.Api.Controllers;

[ApiController]
[Route("api/v1/nfc")]
public class NfcController(NfcService nfc) : ControllerBase
{
    // Officer-authenticated callback that the issuer station fires after
    // it successfully writes the keys + URL to a freshly-printed chip.
    [HttpPost("encode")]
    [Authorize]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "digital_id_cards", EntityIdFrom = "card.id")]
    public Task<EncodeCardResult> Encode([FromBody] EncodeCardDto dto, CancellationToken ct)
        => nfc.RecordEncodedAsync(dto, User.RequireUser(), ct);

    // Public — anyone holding a chip can verify it. Rate limiting is
    // applied at the gateway per CLAUDE.md security checklist.
    [HttpPost("verify")]
    [AllowAnonymous]
    public Task<VerifySunResult> Verify([FromBody] VerifySunDto dto, CancellationToken ct)
        => nfc.VerifyTapAsync(dto, ct);
}
