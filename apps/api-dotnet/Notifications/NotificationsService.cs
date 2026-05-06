using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
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

    // ── Read side (the inbox API consumed by /api/v1/me/notifications) ──

    public async Task<CursorPage<NotificationView>> ListMineAsync(
        CurrentUser actor, ListNotificationsQuery q, CancellationToken ct)
    {
        var query = MyQueryFor(actor);
        if (q.UnreadOnly == true) query = query.Where(n => n.ReadAt == null);

        if (!string.IsNullOrWhiteSpace(q.Cursor)
            && DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
        {
            query = query.Where(n => n.SentAt < cursorTs);
        }

        var rows = await query
            .OrderByDescending(n => n.SentAt)
            .ThenByDescending(n => n.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            nextCursor = rows[q.Limit].SentAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }
        return new CursorPage<NotificationView>
        {
            Items = rows.Select(NotificationView.From).ToList(),
            NextCursor = nextCursor,
        };
    }

    public async Task<int> UnreadCountAsync(CurrentUser actor, CancellationToken ct)
        => await MyQueryFor(actor).Where(n => n.ReadAt == null).CountAsync(ct);

    public async Task<NotificationView> MarkReadAsync(
        Guid notificationId, CurrentUser actor, CancellationToken ct)
    {
        var n = await MyQueryFor(actor)
            .FirstOrDefaultAsync(x => x.Id == notificationId, ct)
            ?? throw SarhException.NotFound("الإشعار", "Notification");

        if (n.ReadAt is null)
        {
            n.ReadAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        return NotificationView.From(n);
    }

    public async Task<int> MarkAllReadAsync(CurrentUser actor, CancellationToken ct)
    {
        var nowUtc = DateTimeOffset.UtcNow;
        return await MyQueryFor(actor)
            .Where(n => n.ReadAt == null)
            .ExecuteUpdateAsync(u => u.SetProperty(n => n.ReadAt, _ => nowUtc), ct);
    }

    // The "is this notification mine?" predicate, applied as a query filter so
    // the action methods all share the same scope rule. Citizens read by
    // citizen_id; officers (any officer role) read by officer_id. Refusing
    // here when neither claim is set keeps the surface tight.
    private IQueryable<Notification> MyQueryFor(CurrentUser actor)
    {
        if (actor.CitizenId is Guid cid)
            return db.Notifications.Where(n => n.RecipientCitizenId == cid);
        if (actor.OfficerId is Guid oid)
            return db.Notifications.Where(n => n.RecipientOfficerId == oid);
        throw SarhException.Forbidden("لا يوجد مستلِم مرتبط بحسابك.");
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
