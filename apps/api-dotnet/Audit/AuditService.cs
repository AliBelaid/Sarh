using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Data;

namespace Sarh.Api.Audit;

public sealed class AuditEntry
{
    public required string ActorKind { get; init; } // officer | citizen | system
    public Guid? ActorId { get; init; }
    public required string Action { get; init; }
    public required string EntityTable { get; init; }
    public Guid? EntityId { get; init; }
    public string? BeforeStateJson { get; init; }
    public string? AfterStateJson { get; init; }
    public string? IpAddress { get; init; }
    public string? UserAgent { get; init; }
}

// Append-only writer for the audit_log table. Inserts use a parameterised
// raw command rather than EF entity tracking — audit_log uses
// BIGINT IDENTITY for ordering and never participates in the request DbContext.
public sealed class AuditService(SarhDbContext db, ILogger<AuditService> log)
{
    public async Task RecordAsync(AuditEntry entry, CancellationToken ct)
    {
        try
        {
            var conn = (SqlConnection)db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO audit_log
                    (actor_kind, actor_id, action, entity_table, entity_id,
                     before_state, after_state, ip_address, user_agent)
                VALUES
                    (@actor_kind, @actor_id, @action, @entity_table, @entity_id,
                     @before_state, @after_state, @ip_address, @user_agent);";
            cmd.Parameters.Add(new SqlParameter("@actor_kind", SqlDbType.NVarChar, 16) { Value = entry.ActorKind });
            cmd.Parameters.Add(new SqlParameter("@actor_id", SqlDbType.UniqueIdentifier) { Value = (object?)entry.ActorId ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@action", SqlDbType.NVarChar, 16) { Value = entry.Action });
            cmd.Parameters.Add(new SqlParameter("@entity_table", SqlDbType.NVarChar, 64) { Value = entry.EntityTable });
            cmd.Parameters.Add(new SqlParameter("@entity_id", SqlDbType.UniqueIdentifier) { Value = (object?)entry.EntityId ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@before_state", SqlDbType.NVarChar, -1) { Value = (object?)entry.BeforeStateJson ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@after_state", SqlDbType.NVarChar, -1) { Value = (object?)entry.AfterStateJson ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@ip_address", SqlDbType.NVarChar, 45) { Value = (object?)entry.IpAddress ?? DBNull.Value });
            cmd.Parameters.Add(new SqlParameter("@user_agent", SqlDbType.NVarChar, -1) { Value = (object?)entry.UserAgent ?? DBNull.Value });
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            // Audit failures must never escalate — losing the request because
            // of an audit write is worse than losing the audit row.
            log.LogError(ex, "Failed to write audit_log entry for {Entity}/{Action}", entry.EntityTable, entry.Action);
        }
    }
}
