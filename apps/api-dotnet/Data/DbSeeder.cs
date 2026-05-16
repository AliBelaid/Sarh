using System.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Sarh.Api.Data;

// Hosted service that runs once on app boot:
//   1. Probes the database with a short retry loop. If still unreachable,
//      logs a clear "run pnpm db:reset" instruction and exits.
//   2. Re-stamps bcrypt hashes for every demo auth user so `Demo!12345`
//      always works regardless of which bcrypt library wrote the hash.
//   3. If the demo dataset is missing (e.g. fresh DB without 029 applied),
//      shells out to sqlcmd to apply 029_seed_mock_data.sql, then re-checks.
//      Falls back to a clear warning if sqlcmd is unavailable.
//
// Running the full schema migrations from the API is intentionally NOT done
// here — they use sqlcmd-only features (GO batches, :r includes). The runner
// `scripts/db/run-migrations.ps1` is the source of truth for the schema.
public sealed class DbSeeder(
    IServiceProvider services,
    IHostEnvironment env,
    ILogger<DbSeeder> logger) : IHostedService
{
    private const string DemoPassword = "Demo!12345";
    private const int ConnectRetries = 5;
    private static readonly TimeSpan ConnectRetryDelay = TimeSpan.FromSeconds(2);

    private static readonly (Guid Id, string Email)[] DemoAccounts =
    [
        // citizen demo (lives in 024_seed_demo.sql)
        (Guid.Parse("00000000-0000-0000-0000-000000000003"), "demo@sarh.ly"),
        // officer demo (lives in 026_seed_demo_officer.sql)
        (Guid.Parse("00000000-0000-0000-0000-000000000010"), "officer@sarh.ly"),
        // 029-seeded officers
        (Guid.Parse("00000000-0000-0000-0000-000000000211"), "manager@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000212"), "idissuer@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000213"), "reviewer@sarh.ly"),
        // 029-seeded citizens
        (Guid.Parse("00000000-0000-0000-0000-000000000111"), "ahmed@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000112"), "fatima@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000113"), "khaled@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000114"), "layla@sarh.ly"),
        // 034-seeded super_admin
        (Guid.Parse("00000000-0000-0000-0000-000000000214"), "admin@sarh.ly"),
        // 034-seeded additional citizens
        (Guid.Parse("00000000-0000-0000-0000-000000000115"), "omar@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000116"), "amina@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000117"), "youssef@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000118"), "hanan@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000119"), "salem@sarh.ly"),
        (Guid.Parse("00000000-0000-0000-0000-000000000120"), "nadia@sarh.ly"),
    ];

    public Task StartAsync(CancellationToken ct)
    {
        // Run on a background thread so a slow DB doesn't block startup —
        // health probes, swagger, etc. should still come up.
        _ = Task.Run(() => RunAsync(ct), ct);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<SarhDbContext>();

            if (!await WaitForDatabaseAsync(db, ct))
            {
                logger.LogWarning(
                    "DbSeeder: database unreachable after {N} attempts. " +
                    "If this is a fresh checkout, run `pnpm db:reset` to apply " +
                    "infra/mssql/migrations/000-030 and create the sarh DB.",
                    ConnectRetries);
                return;
            }

            await EnsureDemoBcryptHashesAsync(db, ct);
            await EnsureDemoCardsAsync(db, ct);
            await EnsureDemoPinHashesAsync(db, ct);
            await EnsureMockDataFloorAsync(db, ct);
        }
        catch (SqlException ex)
        {
            logger.LogWarning(ex, "DbSeeder: SQL error during seed; continuing anyway.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DbSeeder: unexpected error.");
        }
    }

    private async Task<bool> WaitForDatabaseAsync(SarhDbContext db, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= ConnectRetries; attempt++)
        {
            if (await db.Database.CanConnectAsync(ct)) return true;
            if (attempt == ConnectRetries) break;
            logger.LogInformation(
                "DbSeeder: database not ready (attempt {Attempt}/{Total}), retrying in {Delay}s …",
                attempt, ConnectRetries, ConnectRetryDelay.TotalSeconds);
            await Task.Delay(ConnectRetryDelay, ct);
        }
        return false;
    }

    private async Task EnsureDemoBcryptHashesAsync(SarhDbContext db, CancellationToken ct)
    {
        // Compute one fresh hash with the production cost factor, reuse for
        // every demo account. cost=12 matches AuthService's hashing.
        var hash = BCrypt.Net.BCrypt.HashPassword(DemoPassword, 12);
        var rewrites = 0;

        foreach (var (id, _) in DemoAccounts)
        {
            var current = await db.AuthUsers
                .Where(u => u.Id == id)
                .Select(u => u.EncryptedPassword)
                .FirstOrDefaultAsync(ct);

            if (current is null) continue; // account row not seeded — nothing to fix
            if (Verify(current)) continue;  // hash already accepts Demo!12345

            await db.Database.ExecuteSqlRawAsync(
                "UPDATE auth_users SET encrypted_password = {0}, updated_at = SYSDATETIMEOFFSET() WHERE id = {1}",
                new object[] { hash, id }, ct);
            rewrites++;
        }

        if (rewrites > 0)
        {
            logger.LogInformation("DbSeeder: re-stamped bcrypt hashes for {N} demo account(s).", rewrites);
        }
    }

    private static bool Verify(string hash)
    {
        try { return BCrypt.Net.BCrypt.Verify(DemoPassword, hash); }
        catch { return false; }
    }

    // Demo digital ID cards. We re-create these at boot from C# so the
    // staff /app/digital-ids page always has data even if the operator
    // never ran 029_seed_mock_data.sql (or a manual DELETE wiped the table).
    // Tuple shape: card_id, citizen_id, digital_id_number, card_serial,
    // nfc_uid, did, status. PIN hashes get stamped separately by
    // EnsureDemoPinHashesAsync.
    private static readonly (Guid CardId, Guid CitizenId, string Did, string Serial, string NfcUid, string SovDid, string Status)[] DemoCards =
    [
        (Guid.Parse("00000000-0000-0000-0000-000000000301"),
         Guid.Parse("00000000-0000-0000-0000-000000000101"),
         "LY-11-2026-000101-0", "CARD-DEMO-0101", "04A1B2C3D4E5F601", "did:sov:LY:demo:ahmed",  "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000302"),
         Guid.Parse("00000000-0000-0000-0000-000000000102"),
         "LY-11-2026-000102-0", "CARD-DEMO-0102", "04A1B2C3D4E5F602", "did:sov:LY:demo:fatima", "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000303"),
         Guid.Parse("00000000-0000-0000-0000-000000000103"),
         "LY-21-2026-000103-0", "CARD-DEMO-0103", "04A1B2C3D4E5F603", "did:sov:LY:demo:khaled", "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000304"),
         Guid.Parse("00000000-0000-0000-0000-000000000104"),
         "LY-15-2026-000104-0", "CARD-DEMO-0104", "04A1B2C3D4E5F604", "did:sov:LY:demo:layla",  "frozen"),
        // 034-seeded additional cards with varied statuses
        (Guid.Parse("00000000-0000-0000-0000-000000000305"),
         Guid.Parse("00000000-0000-0000-0000-000000000105"),
         "LY-22-2026-000105-0", "CARD-DEMO-0105", "04A1B2C3D4E5F605", "did:sov:LY:demo:omar",   "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000306"),
         Guid.Parse("00000000-0000-0000-0000-000000000106"),
         "LY-13-2026-000106-0", "CARD-DEMO-0106", "04A1B2C3D4E5F606", "did:sov:LY:demo:amina",  "revoked"),
        (Guid.Parse("00000000-0000-0000-0000-000000000307"),
         Guid.Parse("00000000-0000-0000-0000-000000000107"),
         "LY-21-2026-000107-0", "CARD-DEMO-0107", "04A1B2C3D4E5F607", "did:sov:LY:demo:youssef", "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000308"),
         Guid.Parse("00000000-0000-0000-0000-000000000108"),
         "LY-24-2026-000108-0", "CARD-DEMO-0108", "04A1B2C3D4E5F608", "did:sov:LY:demo:hanan",  "expired"),
        (Guid.Parse("00000000-0000-0000-0000-000000000309"),
         Guid.Parse("00000000-0000-0000-0000-000000000109"),
         "LY-31-2026-000109-0", "CARD-DEMO-0109", "04A1B2C3D4E5F609", "did:sov:LY:demo:salem",  "active"),
        (Guid.Parse("00000000-0000-0000-0000-000000000310"),
         Guid.Parse("00000000-0000-0000-0000-000000000110"),
         "LY-12-2026-000110-0", "CARD-DEMO-0110", "04A1B2C3D4E5F610", "did:sov:LY:demo:nadia",  "lost"),
    ];
    private static readonly Guid[] DemoCardIds = DemoCards.Select(c => c.CardId).ToArray();
    private const string DemoCardPin = "123456";

    private async Task EnsureDemoCardsAsync(SarhDbContext db, CancellationToken ct)
    {
        // Skip silently if the parent citizens haven't been seeded yet — the
        // FK would fail. EnsureMockDataFloorAsync handles that branch.
        var existingCitizens = await db.Citizens
            .Where(c => DemoCards.Select(d => d.CitizenId).Contains(c.Id))
            .Select(c => c.Id)
            .ToListAsync(ct);
        if (existingCitizens.Count == 0) return;

        var existingCards = await db.DigitalIdCards
            .Where(c => DemoCardIds.Contains(c.Id))
            .Select(c => c.Id)
            .ToListAsync(ct);

        var inserted = 0;
        foreach (var card in DemoCards)
        {
            if (existingCards.Contains(card.CardId)) continue;
            if (!existingCitizens.Contains(card.CitizenId)) continue;
            await db.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO digital_id_cards
                    (id, citizen_id, digital_id_number, card_serial, nfc_uid, did,
                     issued_at, expires_at, status)
                VALUES
                    ({0}, {1}, {2}, {3}, {4}, {5},
                     SYSDATETIMEOFFSET(), DATEADD(YEAR, 10, SYSDATETIMEOFFSET()), {6})
                """,
                new object[]
                {
                    card.CardId, card.CitizenId, card.Did, card.Serial,
                    card.NfcUid, card.SovDid, card.Status,
                },
                ct);
            inserted++;
        }
        if (inserted > 0)
        {
            logger.LogInformation("DbSeeder: created {N} demo digital ID card(s).", inserted);
        }
    }

    private async Task EnsureDemoPinHashesAsync(SarhDbContext db, CancellationToken ct)
    {
        var hash = BCrypt.Net.BCrypt.HashPassword(DemoCardPin, 10);
        var stamped = 0;
        foreach (var cardId in DemoCardIds)
        {
            var current = await db.DigitalIdCards
                .Where(c => c.Id == cardId)
                .Select(c => c.PinHash)
                .FirstOrDefaultAsync(ct);
            // Skip if a valid bcrypt hash for "123456" already lives there.
            if (!string.IsNullOrEmpty(current))
            {
                try { if (BCrypt.Net.BCrypt.Verify(DemoCardPin, current)) continue; }
                catch { /* fall through and rewrite */ }
            }
            var n = await db.Database.ExecuteSqlRawAsync(
                "UPDATE digital_id_cards SET pin_hash = {0}, pin_set_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET() WHERE id = {1}",
                new object[] { hash, cardId }, ct);
            if (n > 0) stamped++;
        }
        if (stamped > 0)
        {
            logger.LogInformation("DbSeeder: stamped demo PIN ({Pin}) onto {N} card(s).", DemoCardPin, stamped);
        }
    }

    private async Task EnsureMockDataFloorAsync(SarhDbContext db, CancellationToken ct)
    {
        var citizenCount = await db.Citizens.CountAsync(ct);
        var propertyCount = await db.Properties.CountAsync(ct);

        if ((citizenCount == 0 || propertyCount == 0) && env.IsDevelopment())
        {
            // Dev convenience: if the schema is in place but the 029 seed
            // was never run (or was wiped), shell to sqlcmd and apply it.
            // 029 is fully idempotent (MERGE on fixed UUIDs).
            if (TryApplyMockDataSeed())
            {
                citizenCount = await db.Citizens.CountAsync(ct);
                propertyCount = await db.Properties.CountAsync(ct);
            }
        }

        if (citizenCount == 0 || propertyCount == 0)
        {
            logger.LogWarning(
                "DbSeeder: demo dataset is empty (citizens={C}, properties={P}). " +
                "Run `pnpm db:reset` to apply migrations 000-030.",
                citizenCount, propertyCount);
            return;
        }

        logger.LogInformation(
            "DbSeeder: ready. citizens={C}, properties={P}, auth_users={A}.",
            citizenCount, propertyCount, await db.AuthUsers.CountAsync(ct));
    }

    private static readonly string[] SeedMigrations =
    [
        "024_seed_demo.sql",
        "026_seed_demo_officer.sql",
        "029_seed_mock_data.sql",
        "033_seed_card_pins.sql",
        "034_seed_expanded_demo.sql",
    ];

    private bool TryApplyMockDataSeed()
    {
        var migrationsDir = Path.GetFullPath(
            Path.Combine(env.ContentRootPath, "..", "..", "infra", "mssql", "migrations"));

        if (!Directory.Exists(migrationsDir))
        {
            logger.LogWarning("DbSeeder: cannot auto-seed — migrations dir not found at {Path}.", migrationsDir);
            return false;
        }

        // Read connection string from the current config to use SQL auth
        // instead of -E (Windows auth) which fails on machines where
        // the current user is not a SQL Server admin.
        var connStr = services.CreateScope().ServiceProvider
            .GetRequiredService<SarhDbContext>().Database.GetConnectionString() ?? "";
        var sqlUser = "";
        var sqlPassword = "";
        foreach (var part in connStr.Split(';'))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            var key = kv[0].Trim().ToLowerInvariant().Replace(" ", "");
            if (key is "userid" or "uid" or "user") sqlUser = kv[1].Trim();
            if (key is "password" or "pwd") sqlPassword = kv[1].Trim();
        }

        var applied = 0;
        foreach (var seedFile in SeedMigrations)
        {
            var seedPath = Path.Combine(migrationsDir, seedFile);
            if (!File.Exists(seedPath)) continue;

            logger.LogInformation("DbSeeder: applying {File} via sqlcmd …", seedFile);
            if (RunSqlcmd(seedPath, sqlUser, sqlPassword))
                applied++;
            else
                logger.LogWarning("DbSeeder: {File} failed — continuing with remaining seeds.", seedFile);
        }

        return applied > 0;
    }

    private bool RunSqlcmd(string filePath, string sqlUser, string sqlPassword)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "sqlcmd",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("-S");
            psi.ArgumentList.Add("localhost");
            psi.ArgumentList.Add("-d");
            psi.ArgumentList.Add("sarh");
            if (!string.IsNullOrEmpty(sqlUser))
            {
                psi.ArgumentList.Add("-U");
                psi.ArgumentList.Add(sqlUser);
                psi.ArgumentList.Add("-P");
                psi.ArgumentList.Add(sqlPassword);
            }
            else
            {
                psi.ArgumentList.Add("-E");
            }
            psi.ArgumentList.Add("-b");
            psi.ArgumentList.Add("-I");
            psi.ArgumentList.Add("-i");
            psi.ArgumentList.Add(filePath);

            using var proc = Process.Start(psi);
            if (proc is null)
            {
                logger.LogWarning("DbSeeder: sqlcmd could not be launched. Run `pnpm db:reset` manually.");
                return false;
            }
            proc.WaitForExit(60_000);
            if (proc.ExitCode != 0)
            {
                var stderr = proc.StandardError.ReadToEnd();
                logger.LogWarning("DbSeeder: sqlcmd exited {Code}. stderr: {Err}", proc.ExitCode, stderr);
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "DbSeeder: sqlcmd invocation failed (likely not on PATH).");
            return false;
        }
    }
}
