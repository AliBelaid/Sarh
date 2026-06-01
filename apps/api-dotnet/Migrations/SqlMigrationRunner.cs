using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sarh.Api.Migrations;

/// <summary>
/// Shared executor for the SQL-backed EF Core migrations. Each migration class calls
/// <see cref="Apply"/> with the name of one embedded <c>infra/mssql/migrations/*.sql</c>
/// file (see the <c>&lt;EmbeddedResource&gt;</c> items in <c>Sarh.Api.csproj</c>).
///
/// The T-SQL is the single source of truth: it is compiled into the assembly so a published
/// build runs on any PC without the <c>infra</c> folder being present on disk.
///
/// Two T-SQL realities are handled here:
/// <list type="bullet">
///   <item><b>GO batch separators</b> are not valid inside a single command, so the script is
///   split on <c>GO</c> and each batch is emitted as its own operation.</item>
///   <item><b>suppressTransaction</b> is set on every batch because several files contain
///   statements that SQL Server forbids inside a transaction — <c>CREATE/ALTER DATABASE</c>
///   (000), <c>SET ALLOW_SNAPSHOT_ISOLATION</c> (000) and <c>CREATE FULLTEXT CATALOG</c>
///   (014). This is exactly why the old in-process transactional migrator failed on a fresh
///   database; replaying the SQL outside a transaction mirrors the proven sqlcmd path.</item>
/// </list>
/// </summary>
internal static class SqlMigrationRunner
{
    private static readonly Assembly Assembly = typeof(SqlMigrationRunner).Assembly;

    private static readonly Regex GoSeparator = new(
        @"^\s*GO\s*$",
        RegexOptions.Multiline | RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Logical resource prefix configured via <c>LogicalName</c> in the csproj.</summary>
    private const string ResourcePrefix = "SarhSql.";

    // `USE [<db>]` on its own line — harmless to drop because the EF migration
    // connection is already scoped to the target database.
    private static readonly Regex UseStatement = new(
        @"^\s*USE\s+\[[^\]]+\]\s*;?\s*$",
        RegexOptions.Multiline | RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Any batch that creates/alters a database. The numbered T-SQL hardcodes
    // `[sarh]`; replaying that against a differently-named target would create the
    // wrong database or, worse, `USE [sarh]` would redirect every following DDL
    // statement to an unrelated database. EfDatabaseBootstrapper already provisions
    // the target database (with the Arabic collation) before migrations run, so
    // these database-level statements are redundant here and are skipped.
    private static readonly Regex DatabaseScopedStatement = new(
        @"\b(CREATE|ALTER)\s+DATABASE\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void Apply(MigrationBuilder migrationBuilder, string sqlFileName)
    {
        var sql = LoadEmbeddedSql(sqlFileName);

        foreach (var rawBatch in GoSeparator.Split(sql))
        {
            // Drop the whole batch if it creates/alters a database — these only
            // appear in 000_database.sql and are already handled by the bootstrapper.
            if (DatabaseScopedStatement.IsMatch(rawBatch))
            {
                continue;
            }

            // Strip stray `USE [<db>]` lines so the replay always stays on the
            // connection's database, whatever it is named.
            var batch = UseStatement.Replace(rawBatch, string.Empty);
            if (string.IsNullOrWhiteSpace(batch))
            {
                continue;
            }

            migrationBuilder.Sql(batch, suppressTransaction: true);
        }
    }

    private static string LoadEmbeddedSql(string sqlFileName)
    {
        var resourceName = ResourcePrefix + sqlFileName;

        using var stream = Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            var available = string.Join(", ", Assembly.GetManifestResourceNames());
            throw new InvalidOperationException(
                $"Embedded SQL migration resource '{resourceName}' was not found. " +
                $"Ensure the file exists under infra/mssql/migrations and is included as an " +
                $"<EmbeddedResource> in Sarh.Api.csproj. Available resources: {available}");
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
