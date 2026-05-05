using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.DigitalIdCards;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/digital-id-cards")]
[Authorize]
public class DigitalIdCardsController(DigitalIdCardsService cards) : ControllerBase
{
    [HttpGet]
    [OfficerOnly("id_issuer", "super_admin", "auditor", "registry_officer")]
    public Task<CursorPage<CardView>> List([FromQuery] ListCardsQuery q, CancellationToken ct)
        => cards.ListAsync(q, User.RequireUser(), ct);

    [HttpPost("issue")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.IssueId, Entity = "digital_id_cards", EntityIdFrom = "card.id")]
    public Task<IssueCardResult> Issue([FromBody] IssueCardDto dto, CancellationToken ct)
        => cards.IssueAsync(dto, User.RequireUser(), ct);

    [HttpPost("{id:guid}/freeze")]
    [OfficerOnly("id_issuer", "super_admin", "registry_officer")]
    [Audit(Action = AuditActions.Update, Entity = "digital_id_cards")]
    public Task<CardView> Freeze(Guid id, [FromBody] FreezeCardDto dto, CancellationToken ct)
        => cards.FreezeAsync(id, dto, User.RequireUser(), ct);

    [HttpPost("{id:guid}/revoke")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.RevokeId, Entity = "digital_id_cards")]
    public Task<CardView> Revoke(Guid id, [FromBody] RevokeCardDto dto, CancellationToken ct)
        => cards.RevokeAsync(id, dto, User.RequireUser(), ct);

    [HttpPost("{id:guid}/reissue")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.IssueId, Entity = "digital_id_cards", EntityIdFrom = "card.id")]
    public Task<IssueCardResult> Reissue(Guid id, [FromBody] ReissueCardDto dto, CancellationToken ct)
        => cards.ReissueAsync(id, dto, User.RequireUser(), ct);
}
