using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Sarh.Api.Data;

/// <summary>
/// Resolves the connection string used for <b>schema migrations</b>, which is deliberately
/// distinct from the runtime connection.
///
/// The runtime app connects as <c>sarh_app</c> — a low-privilege login that cannot
/// <c>CREATE DATABASE</c>, create logins, or run most DDL. Migrations therefore need a
/// privileged connection (the same way <c>run-migrations.ps1</c> used <c>sqlcmd -E</c>,
/// i.e. Windows auth). Resolution order:
/// <list type="number">
///   <item><c>Sarh:MigrationConnectionString</c> (config) or <c>SARH_MIGRATION_CONNECTION</c>
///   (env) — set this in production to a deploy account with DDL rights.</item>
///   <item>Otherwise derive a Windows-auth connection from <c>Sarh:ConnectionString</c>
///   (same server/database, Integrated Security, no user/password) — the zero-config dev
///   path on a local SQL Server where the developer is a sysadmin.</item>
///   <item>Final fallback: trusted localhost / database <c>sarh</c>.</item>
/// </list>
/// </summary>
public static class MigrationConnection
{
    public static string Resolve(IConfiguration config)
    {
        var explicitConn = config["Sarh:MigrationConnectionString"]
            ?? Environment.GetEnvironmentVariable("SARH_MIGRATION_CONNECTION");
        if (!string.IsNullOrWhiteSpace(explicitConn))
        {
            return explicitConn;
        }

        var runtime = config["Sarh:ConnectionString"];
        if (string.IsNullOrWhiteSpace(runtime))
        {
            return "Server=localhost;Database=sarh;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;";
        }

        var builder = new SqlConnectionStringBuilder(runtime)
        {
            IntegratedSecurity = true,
        };
        // Strip the sarh_app credentials — Integrated Security replaces them.
        builder.Remove("User ID");
        builder.Remove("Password");
        return builder.ConnectionString;
    }
}
