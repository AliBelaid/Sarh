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
    public Task<CursorPage<CardView>> List([FromQuery] ListCardsQuery q, CancellationToken ct)
        => cards.ListAsync(q, User.RequireUser(), ct);

    [HttpPost("issue")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.IssueId, Entity = "digital_id_cards", EntityIdFrom = "card.id", CaptureResponseBody = false)]
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
    [Audit(Action = AuditActions.IssueId, Entity = "digital_id_cards", EntityIdFrom = "card.id", CaptureResponseBody = false)]
    public Task<IssueCardResult> Reissue(Guid id, [FromBody] ReissueCardDto dto, CancellationToken ct)
        => cards.ReissueAsync(id, dto, User.RequireUser(), ct);

    [HttpPost("{id:guid}/reset-pin")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "digital_id_cards", EntityIdFrom = "card_id", CaptureResponseBody = false)]
    public Task<ResetPinResult> ResetPin(Guid id, CancellationToken ct)
        => cards.ResetPinAsync(id, User.RequireUser(), ct);

    // Edit the card's validity window (expires_at). Other attributes are
    // immutable by design — see UpdateAsync.
    [HttpPatch("{id:guid}")]
    [OfficerOnly("id_issuer", "super_admin")]
    [Audit(Action = AuditActions.Update, Entity = "digital_id_cards")]
    public Task<CardView> Update(Guid id, [FromBody] UpdateCardDto dto, CancellationToken ct)
        => cards.UpdateAsync(id, dto, User.RequireUser(), ct);

    // Super-admin only. Soft-deletes the card (status=revoked, PIN+NFC
    // scrubbed) and purges nfc_card_secrets. Body is optional — if a
    // reason is supplied it lands in revoked_reason and id_issuance_history.
    [HttpDelete("{id:guid}")]
    [OfficerOnly("super_admin")]
    [Audit(Action = AuditActions.Delete, Entity = "digital_id_cards", EntityIdFrom = "card_id")]
    public Task<DeleteCardResult> Delete(Guid id, [FromBody] DeleteCardDto? dto, CancellationToken ct)
        => cards.DeleteAsync(id, dto ?? new DeleteCardDto(), User.RequireUser(), ct);
}
