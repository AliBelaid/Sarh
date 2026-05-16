using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("audit_log")]
public class AuditLogEntry
{
    [Column("id")] public long Id { get; set; }
    [Column("actor_kind")] public string ActorKind { get; set; } = "";
    [Column("actor_id")] public Guid? ActorId { get; set; }
    [Column("action")] public string Action { get; set; } = "";
    [Column("entity_table")] public string EntityTable { get; set; } = "";
    [Column("entity_id")] public Guid? EntityId { get; set; }
    [Column("before_state")] public string? BeforeState { get; set; }
    [Column("after_state")] public string? AfterState { get; set; }
    [Column("ip_address")] public string? IpAddress { get; set; }
    [Column("user_agent")] public string? UserAgent { get; set; }
    [Column("occurred_at")] public DateTimeOffset OccurredAt { get; set; }
}
