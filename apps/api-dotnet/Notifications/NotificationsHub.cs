using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Sarh.Api.Auth;

namespace Sarh.Api.Notifications;

[Authorize]
public sealed class NotificationsHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = Context.User?.RequireUserOrNull();
        if (user is null) { Context.Abort(); return; }

        if (user.CitizenId is not null)
            await Groups.AddToGroupAsync(Context.ConnectionId, $"citizen:{user.CitizenId}");
        if (user.OfficerId is not null)
            await Groups.AddToGroupAsync(Context.ConnectionId, $"officer:{user.OfficerId}");
        if (user.RegionId is not null)
            await Groups.AddToGroupAsync(Context.ConnectionId, $"region:{user.RegionId}");

        await base.OnConnectedAsync();
    }
}
