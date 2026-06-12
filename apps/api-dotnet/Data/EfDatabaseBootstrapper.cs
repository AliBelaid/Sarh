using System.Data;
using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Sarh.Api.Data;

/// <summary>
/// Provisions the Sarh database through EF Core so a fresh clone comes up on any PC with no
/// manual <c>.sql</c> / <c>.ps1</c> step. Used by the startup auto-migrate path and by
/// <c>dotnet run -- --migrate</c>. It runs against the privileged migration connection
/// (see <see cref="MigrationConnection"/>) and does the following:
/// <list type="number">
///   <item><b>Server objects</b> — ensures the <c>sarh_app</c> login exists (from the embedded
///   <c>bootstrap-login.sql</c>) and the database exists with the <c>Arabic_CI_AS</c> collation,
///   so EF does not silently create it with the server's default collation.</item>
///   <item><b>History</b> — ensures <c>__EFMigrationsHistory</c> exists so applied steps are
///   tracked exactly like a normal EF-managed database.</item>
///   <item><b>Baseline</b> — if the database was already built by the legacy sqlcmd runner
///   (tables present but history empty), every known migration is recorded as applied instead of
///   being re-run on top of an existing schema.</item>
///   <item><b>Apply</b> — replays each pending migration's embedded T-SQL <b>in order</b> and
///   records it in history.</item>
/// </list>
///
/// <para>Why this applies the SQL directly instead of calling <c>Database.MigrateAsync</c>:
/// every numbered file is authoritative T-SQL containing <c>GO</c> batches and statements that
/// cannot run inside a transaction (<c>CREATE FULLTEXT CATALOG</c>, etc.). EF's migrator wraps
/// migrations in its own transaction/replay machinery, which does not survive a 45-file replay of
/// raw batches (it aborts mid-way leaving a half-built schema and no history). Executing the
/// batches directly — autocommit, one statement at a time — mirrors the proven sqlcmd path while
/// still tracking everything in <c>__EFMigrationsHistory</c>.</para>
/// </summary>
public static class EfDatabaseBootstrapper
{
    private static readonly Assembly Assembly = typeof(EfDatabaseBootstrapper).Assembly;

    private const string ResourcePrefix = "SarhSql.";

    private static readonly Regex GoSeparator = new(
        @"^\s*GO\s*$",
        RegexOptions.Multiline | RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // `USE [<db>]` on its own line — dropped because the connection is already scoped to the
    // target database; keeping it would redirect DDL to whatever database the file hardcodes.
    private static readonly Regex UseStatement = new(
        @"^\s*USE\s+\[[^\]]+\]\s*;?\s*$",
        RegexOptions.Multiline | RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Any batch that creates/alters a database. The numbered T-SQL hardcodes `[sarh]`; the
    // database itself is already provisioned (with the Arabic collation) by EnsureServerObjects.
    private static readonly Regex DatabaseScopedStatement = new(
        @"\b(CREATE|ALTER)\s+DATABASE\b",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Migrations whose ONLY job is to insert demo rows. When the caller opts out
    // (Sarh:SeedDemoViaMigrations=false) these are recorded as applied but their
    // INSERTs are not run, so a fresh database comes up empty and the demo
    // dataset is supplied instead by the DbSeeder / the landing "load demo data"
    // button (apps/api-dotnet/Data/DemoData/seed-data.json). 016_seed_regions is
    // deliberately NOT here — regions are lookup data the app needs to function.
    private static readonly HashSet<string> DemoSeedFiles = new(StringComparer.OrdinalIgnoreCase)
    {
        "024_seed_demo.sql",
        "026_seed_demo_officer.sql",
        "029_seed_mock_data.sql",
        "033_seed_card_pins.sql",
        "034_seed_expanded_demo.sql",
        "044_seed_map_demo.sql",
    };

    public static async Task RunAsync(
        string migrationConnectionString, ILogger logger,
        bool seedDemoViaMigrations = true, CancellationToken ct = default)
    {
        var dbName = new SqlConnectionStringBuilder(migrationConnectionString).InitialCatalog;
        if (string.IsNullOrWhiteSpace(dbName))
        {
            dbName = "sarh";
        }

        await EnsureServerObjectsAsync(migrationConnectionString, dbName, logger, ct);

        await using var conn = new SqlConnection(migrationConnectionString);
        await conn.OpenAsync(ct);

        await EnsureHistoryTableAsync(conn, ct);

        // Ordered list of (migrationId, sqlFileName) derived from the EF migration classes.
        var migrations = GetMigrationPlan();
        var applied = await GetAppliedMigrationsAsync(conn, ct);
        var pending = migrations.Where(m => !applied.Contains(m.Id)).ToList();

        if (pending.Count == 0)
        {
            logger.LogInformation("Database '{Db}' is up to date — no pending migrations.", dbName);
            return;
        }

        // Baseline: an existing non-EF database (built by the legacy sqlcmd runner) has the schema
        // but an empty history. Record every migration as applied instead of replaying DDL onto it.
        if (await IsExistingLegacySchemaAsync(conn, ct))
        {
            logger.LogWarning(
                "Existing non-EF database detected (built by the legacy sqlcmd runner). " +
                "Baselining: recording {Count} migration(s) as applied instead of rebuilding the schema.",
                pending.Count);
            foreach (var m in pending)
            {
                await InsertHistoryAsync(conn, m.Id, ct);
            }
            logger.LogInformation("Baseline complete — {Count} migration(s) recorded as applied.", pending.Count);
            return;
        }

        logger.LogInformation("Applying {Count} pending migration(s) to '{Db}': {List}",
            pending.Count, dbName, string.Join(", ", pending.Select(m => m.Id)));

        foreach (var m in pending)
        {
            if (!seedDemoViaMigrations && DemoSeedFiles.Contains(m.SqlFile))
            {
                // Record as applied without running the INSERTs — the schema stays
                // empty so the first-run "load demo data" flow has something to do.
                await InsertHistoryAsync(conn, m.Id, ct);
                logger.LogInformation("  skipped demo-seed {Id} (Sarh:SeedDemoViaMigrations=false)", m.Id);
                continue;
            }
            await ApplySqlFileAsync(conn, m.SqlFile, ct);
            await InsertHistoryAsync(conn, m.Id, ct);
            logger.LogInformation("  applied {Id}", m.Id);
        }

        logger.LogInformation("Migration complete. Database '{Db}' is ready.", dbName);
    }

    /// <summary>
    /// The ordered migration plan. Discovered from the EF <c>[Migration]</c> classes so it stays in
    /// sync with <c>SarhSchemaMigrations.cs</c>; each id maps 1:1 to a <c>NNN_*.sql</c> file
    /// (id <c>"20240101000002_002_lookup"</c> → <c>"002_lookup.sql"</c>).
    /// </summary>
    private static List<(string Id, string SqlFile)> GetMigrationPlan()
    {
        var options = new DbContextOptionsBuilder<SarhDbContext>()
            .UseSqlServer("Server=.;Database=_design;Trusted_Connection=True;")
            .Options;
        using var db = new SarhDbContext(options);
        return db.Database.GetMigrations()
            .OrderBy(id => id, StringComparer.Ordinal)
            .Select(id =>
            {
                var sep = id.IndexOf('_');
                var suffix = sep >= 0 ? id[(sep + 1)..] : id;
                return (Id: id, SqlFile: suffix + ".sql");
            })
            .ToList();
    }

    private static async Task EnsureServerObjectsAsync(
        string migrationConnectionString, string dbName, ILogger logger, CancellationToken ct)
    {
        var masterConn = new SqlConnectionStringBuilder(migrationConnectionString)
        {
            InitialCatalog = "master",
        }.ConnectionString;

        await using var conn = new SqlConnection(masterConn);
        await conn.OpenAsync(ct);

        // 1. Server login (idempotent — the script only creates it if missing).
        var loginSql = TryLoadEmbedded("SarhSql.bootstrap-login.sql");
        if (loginSql is not null)
        {
            try
            {
                foreach (var batch in GoSeparator.Split(loginSql))
                {
                    if (!string.IsNullOrWhiteSpace(batch))
                    {
                        await ExecAsync(conn, batch, ct);
                    }
                }
                logger.LogInformation("Ensured server login 'sarh_app'.");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "Could not ensure 'sarh_app' login — it may already exist or the migration " +
                    "account lacks securityadmin. Continuing.");
            }
        }

        // 2. Database with the Arabic collation (idempotent). Creating it here means EF does
        //    not create it later with the server's default collation.
        var quoted = dbName.Replace("]", "]]");
        var literal = dbName.Replace("'", "''");
        await ExecAsync(conn,
            $"IF DB_ID(N'{literal}') IS NULL CREATE DATABASE [{quoted}] COLLATE Arabic_CI_AS;", ct);
        logger.LogInformation("Ensured database '{Db}' exists.", dbName);
    }

    private static async Task EnsureHistoryTableAsync(SqlConnection conn, CancellationToken ct)
    {
        await ExecAsync(conn,
            "IF OBJECT_ID(N'[dbo].[__EFMigrationsHistory]') IS NULL " +
            "CREATE TABLE [dbo].[__EFMigrationsHistory] (" +
            "[MigrationId] nvarchar(150) NOT NULL " +
            "CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY, " +
            "[ProductVersion] nvarchar(32) NOT NULL);", ct);
    }

    private static async Task<HashSet<string>> GetAppliedMigrationsAsync(SqlConnection conn, CancellationToken ct)
    {
        var applied = new HashSet<string>(StringComparer.Ordinal);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT [MigrationId] FROM [dbo].[__EFMigrationsHistory];";
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            applied.Add(reader.GetString(0));
        }
        return applied;
    }

    private static async Task<bool> IsExistingLegacySchemaAsync(SqlConnection conn, CancellationToken ct)
    {
        return await ScalarBoolAsync(conn,
            "SELECT CASE WHEN OBJECT_ID(N'[dbo].[auth_users]') IS NULL " +
            "AND OBJECT_ID(N'[dbo].[citizens]') IS NULL THEN 0 ELSE 1 END", ct);
    }

    private static async Task InsertHistoryAsync(SqlConnection conn, string migrationId, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "IF NOT EXISTS (SELECT 1 FROM [dbo].[__EFMigrationsHistory] WHERE [MigrationId] = @id) " +
            "INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion]) VALUES (@id, @ver);";
        cmd.Parameters.Add(new SqlParameter("@id", migrationId));
        cmd.Parameters.Add(new SqlParameter("@ver", "8.0.10"));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>
    /// Loads one embedded <c>NNN_*.sql</c> file and executes its batches directly (autocommit,
    /// GO-split), stripping database-scoped statements so the replay always stays on the
    /// connection's database whatever it is named.
    /// </summary>
    private static async Task ApplySqlFileAsync(SqlConnection conn, string sqlFileName, CancellationToken ct)
    {
        var sql = TryLoadEmbedded(ResourcePrefix + sqlFileName)
            ?? throw new InvalidOperationException(
                $"Embedded SQL migration resource '{ResourcePrefix}{sqlFileName}' was not found. " +
                $"Ensure the file exists under infra/mssql/migrations and is included as an " +
                $"<EmbeddedResource> in Sarh.Api.csproj.");

        foreach (var rawBatch in GoSeparator.Split(sql))
        {
            // Skip whole-database statements (CREATE/ALTER DATABASE) — already provisioned.
            if (DatabaseScopedStatement.IsMatch(rawBatch))
            {
                continue;
            }

            var batch = UseStatement.Replace(rawBatch, string.Empty);
            if (string.IsNullOrWhiteSpace(batch))
            {
                continue;
            }

            await ExecAsync(conn, batch, ct);
        }
    }

    private static async Task ExecAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.CommandTimeout = 180;
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<bool> ScalarBoolAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null && result != DBNull.Value && Convert.ToInt32(result) == 1;
    }

    private static string? TryLoadEmbedded(string resourceName)
    {
        using var stream = Assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return null;
        }
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
