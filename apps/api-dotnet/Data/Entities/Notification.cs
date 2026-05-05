using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("notifications")]
public class Notification
{
    [Column("id")] public Guid Id { get; set; }
    [Column("recipient_citizen_id")] public Guid? RecipientCitizenId { get; set; }
    [Column("recipient_officer_id")] public Guid? RecipientOfficerId { get; set; }
    [Column("kind")] public string Kind { get; set; } = "in_app";
    [Column("title_ar")] public string? TitleAr { get; set; }
    [Column("body_ar")] public string? BodyAr { get; set; }
    [Column("payload")] public string? Payload { get; set; }
    [Column("sent_at")] public DateTimeOffset SentAt { get; set; }
    [Column("read_at")] public DateTimeOffset? ReadAt { get; set; }
    [Column("delivery_status")] public string DeliveryStatus { get; set; } = "queued";
}
