using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Notifications;

// Phase-6 notifications. Writes in-app rows to the notifications table on
// key workflow events. Real SMS/email/push transports land in Phase 12 —
// the existing schema already has a `kind` column with sms/push/email/in_app
// values, so adding transports later is a service-layer change only.
//
// Failures here MUST NOT escalate. Notification loss is acceptable; losing
// the originating request because of a notification failure is not.
public sealed class NotificationsService(SarhDbContext db, ILogger<NotificationsService> log)
{
    public async Task NotifyCitizenAsync(
        Guid citizenId, string titleAr, string bodyAr, object? payload, CancellationToken ct)
    {
        await TryInsertAsync(new Notification
        {
            Id = Guid.NewGuid(),
            RecipientCitizenId = citizenId,
            Kind = "in_app",
            TitleAr = titleAr,
            BodyAr = bodyAr,
            Payload = payload is null ? null : JsonSerializer.Serialize(payload),
            DeliveryStatus = "queued",
        }, ct);
    }

    public async Task NotifyOfficerAsync(
        Guid officerId, string titleAr, string bodyAr, object? payload, CancellationToken ct)
    {
        await TryInsertAsync(new Notification
        {
            Id = Guid.NewGuid(),
            RecipientOfficerId = officerId,
            Kind = "in_app",
            TitleAr = titleAr,
            BodyAr = bodyAr,
            Payload = payload is null ? null : JsonSerializer.Serialize(payload),
            DeliveryStatus = "queued",
        }, ct);
    }

    // Notify every reviewer-class officer in a region. Used when a citizen
    // submits a property and reviewers need to see it in their queue.
    public async Task NotifyReviewersInRegionAsync(
        int regionId, string titleAr, string bodyAr, object? payload, CancellationToken ct)
    {
        try
        {
            var officers = await db.Officers.AsNoTracking()
                .Where(o => o.IsActive
                            && o.RegionId == regionId
                            && (o.Role == "registry_officer" || o.Role == "reviewer"))
                .Select(o => o.Id)
                .ToListAsync(ct);
            foreach (var oid in officers)
                await NotifyOfficerAsync(oid, titleAr, bodyAr, payload, ct);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "NotifyReviewersInRegionAsync failed for region {Region}", regionId);
        }
    }

    private async Task TryInsertAsync(Notification n, CancellationToken ct)
    {
        try
        {
            db.Notifications.Add(n);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Notification insert failed (recipient_citizen={C}, recipient_officer={O})",
                n.RecipientCitizenId, n.RecipientOfficerId);
            // Detach so a later SaveChanges in the same scope doesn't retry.
            db.Entry(n).State = EntityState.Detached;
        }
    }
}
