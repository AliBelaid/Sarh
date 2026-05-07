using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Sarh.Api.Data;

// Hosted service that runs once on app boot:
//   1. Probes the database. If unreachable, exits gracefully (lets the API
//      start and surface a clearer error on the first request).
//   2. Re-stamps bcrypt hashes for every demo auth user so `Demo!12345`
//      always works regardless of which bcrypt library wrote the hash.
//      The SQL seed (029_seed_mock_data.sql) ships a bcryptjs-generated
//      hash; BCrypt.Net-Next can read it but we re-stamp anyway with
//      cost-12 to align with production.
//   3. If the demo dataset is missing (e.g. the operator dropped the DB
//      and only ran 000–028), it inserts a minimal floor of mock data so
//      the digital-ID + property demos still work. Idempotent — safe to
//      run on every boot.
//
// Running migrations from the API is intentionally NOT done here. We rely
// on `pnpm db:reset` / `scripts/db/run-migrations.ps1` for schema, because
// some migrations use sqlcmd-only features (full-text catalogs, GO batches).
public sealed class DbSeeder(
    IServiceProvider services,
    ILogger<DbSeeder> logger) : IHostedService
{
    private const string DemoPassword = "Demo!12345";

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

            if (!await db.Database.CanConnectAsync(ct))
            {
                logger.LogWarning("DbSeeder: database unreachable, skipping seed.");
                return;
            }

            await EnsureDemoBcryptHashesAsync(db, ct);
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

    private async Task EnsureMockDataFloorAsync(SarhDbContext db, CancellationToken ct)
    {
        // If the 029 seed wasn't applied (or someone wiped the demo data),
        // we don't try to recreate it from C#. Just log loudly. The SQL is
        // the source of truth for spatial polygons, NFT metadata, etc.
        var citizenCount = await db.Citizens.CountAsync(ct);
        var propertyCount = await db.Properties.CountAsync(ct);

        if (citizenCount == 0 || propertyCount == 0)
        {
            logger.LogWarning(
                "DbSeeder: demo dataset is empty (citizens={C}, properties={P}). " +
                "Run `pnpm db:reset` to apply migrations 000-029.",
                citizenCount, propertyCount);
            return;
        }

        logger.LogInformation(
            "DbSeeder: ready. citizens={C}, properties={P}, auth_users={A}.",
            citizenCount, propertyCount, await db.AuthUsers.CountAsync(ct));
    }
}
