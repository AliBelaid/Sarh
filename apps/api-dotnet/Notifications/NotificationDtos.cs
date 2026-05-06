using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Notifications;

public sealed class ListNotificationsQuery
{
    public string? Cursor { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 30;
    [Microsoft.AspNetCore.Mvc.FromQuery(Name = "unread_only")]
    public bool? UnreadOnly { get; set; }
}

public sealed class NotificationView
{
    public Guid Id { get; init; }
    public string Kind { get; init; } = "";
    public string? TitleAr { get; init; }
    public string? BodyAr { get; init; }
    // Parsed JSON when stored as a JSON object — saves the UI a parse step.
    public JsonElement? Payload { get; init; }
    public DateTimeOffset SentAt { get; init; }
    public DateTimeOffset? ReadAt { get; init; }
    public string DeliveryStatus { get; init; } = "";

    public static NotificationView From(Notification n) => new()
    {
        Id = n.Id,
        Kind = n.Kind,
        TitleAr = n.TitleAr,
        BodyAr = n.BodyAr,
        Payload = TryParse(n.Payload),
        SentAt = n.SentAt,
        ReadAt = n.ReadAt,
        DeliveryStatus = n.DeliveryStatus,
    };

    private static JsonElement? TryParse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
        catch (JsonException) { return null; }
    }
}
