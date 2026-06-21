using System.Data;
using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Sarh.Api.Data;

// Sets SQL Server SESSION_CONTEXT from the current request's identity every
// time a connection is opened. This is what makes the Row-Level Security
// policies (infra/mssql/migrations/015_rls.sql) actually function under the
// .NET stack: the audit_log FILTER predicate only reveals rows when
// SESSION_CONTEXT('officer_role') is an auditor-class role, and the
// digital_id_cards predicate keys off SESSION_CONTEXT('citizen_id').
//
// The original Supabase/NestJS design bound a JWT to each DB connection and
// set this context per request. After the move to a single privileged
// `sarh_app` connection it was dropped — so audited writes persisted but were
// invisible to every reader, and the audit page was permanently empty.
//
// Crucially we set the keys on EVERY open (to NULL when anonymous) so a pooled
// connection that previously served a super_admin can never leak that
// visibility to a later anonymous/citizen request.
public sealed class SessionContextInterceptor(IHttpContextAccessor http) : DbConnectionInterceptor
{
    // Officer roles that the audit_log predicate accepts as readers live in the
    // policy itself; here we simply forward whatever role the request carries.
    private const string SetSql = @"
        EXEC sys.sp_set_session_context @key = N'officer_role', @value = @role;
        EXEC sys.sp_set_session_context @key = N'citizen_id',   @value = @citizen;";

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        Apply(connection);
        base.ConnectionOpened(connection, eventData);
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await ApplyAsync(connection, cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    private (object Role, object Citizen) ResolveValues()
    {
        var user = http.HttpContext?.User;
        object role = DBNull.Value;
        object citizen = DBNull.Value;

        if (user?.Identity?.IsAuthenticated == true)
        {
            var sarhRole = user.FindFirst("sarh_role")?.Value;
            // Anyone who isn't a plain citizen is treated as an officer for the
            // session context; the predicate decides which roles can read.
            if (!string.IsNullOrWhiteSpace(sarhRole) && sarhRole != "citizen")
                role = sarhRole;

            if (Guid.TryParse(user.FindFirst("citizen_id")?.Value, out var cid))
                citizen = cid;
        }

        return (role, citizen);
    }

    private void Apply(DbConnection connection)
    {
        if (connection is not SqlConnection sql) return;
        var (role, citizen) = ResolveValues();
        using var cmd = NewCommand(sql, role, citizen);
        cmd.ExecuteNonQuery();
    }

    private async Task ApplyAsync(DbConnection connection, CancellationToken ct)
    {
        if (connection is not SqlConnection sql) return;
        var (role, citizen) = ResolveValues();
        await using var cmd = NewCommand(sql, role, citizen);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static SqlCommand NewCommand(SqlConnection sql, object role, object citizen)
    {
        var cmd = sql.CreateCommand();
        cmd.CommandText = SetSql;
        cmd.Parameters.Add(new SqlParameter("@role", SqlDbType.NVarChar, 32) { Value = role });
        cmd.Parameters.Add(new SqlParameter("@citizen", SqlDbType.UniqueIdentifier) { Value = citizen });
        return cmd;
    }
}
