using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Notifications;
using Sarh.Api.Workflow;

namespace Sarh.Api.Controllers;

// "me"-scoped read endpoints. The path prefix avoids the
// citizen-id-in-the-path footgun (where a citizen sniffs another's id and
// tries to fetch their data) — the authenticated subject is always the
// authoritative source. Notifications endpoints serve both citizens and
// officers, scoped via the JWT's citizen_id / officer_id claims.
[ApiController]
[Route("api/v1/me")]
[Authorize]
public class MeController(NftsService nfts, NotificationsService notifications) : ControllerBase
{
    [HttpGet("nft-licences")]
    public Task<List<NftLicenseView>> MyLicences(CancellationToken ct)
        => nfts.ListMyAsync(User.RequireUser(), ct);

    [HttpGet("notifications")]
    public Task<CursorPage<NotificationView>> Notifications(
        [FromQuery] ListNotificationsQuery q, CancellationToken ct)
        => notifications.ListMineAsync(User.RequireUser(), q, ct);

    [HttpGet("notifications/unread-count")]
    public async Task<UnreadCountResult> UnreadCount(CancellationToken ct)
        => new() { Count = await notifications.UnreadCountAsync(User.RequireUser(), ct) };

    [HttpPost("notifications/{id:guid}/read")]
    public Task<NotificationView> MarkRead(Guid id, CancellationToken ct)
        => notifications.MarkReadAsync(id, User.RequireUser(), ct);

    [HttpPost("notifications/read-all")]
    public async Task<MarkAllReadResult> MarkAllRead(CancellationToken ct)
        => new() { Updated = await notifications.MarkAllReadAsync(User.RequireUser(), ct) };
}

public sealed class UnreadCountResult { public int Count { get; init; } }
public sealed class MarkAllReadResult { public int Updated { get; init; } }
