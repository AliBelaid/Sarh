using Microsoft.EntityFrameworkCore;
using Sarh.Api.Data.DemoData;

namespace Sarh.Api.Data;

/// <summary>
/// Boot-time seeder: probes the DB, then ensures the demo dataset exists by
/// importing the committed <c>Data/DemoData/seed-data.json</c> idempotently
/// (IF NOT EXISTS by id — existing rows are preserved, missing ones topped up).
/// No sqlcmd dependency. Controlled by <c>Sarh:AutoSeedDemo</c> (default: on in
/// Development, off elsewhere) so an empty production/demo box can instead be
/// populated on demand from the landing page "تحميل البيانات التجريبية" button.
/// </summary>
public sealed class DbSeeder(
    IServiceProvider services,
    IHostEnvironment env,
    IConfiguration config,
    ILogger<DbSeeder> logger) : IHostedService
{
    private const int ConnectRetries = 5;
    private static readonly TimeSpan ConnectRetryDelay = TimeSpan.FromSeconds(2);

    public Task StartAsync(CancellationToken ct)
    {
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
                    "Run `pnpm db:reset` to create the sarh DB.",
                    ConnectRetries);
                return;
            }

            var autoSeed = config.GetValue("Sarh:AutoSeedDemo", env.IsDevelopment());
            if (!autoSeed)
            {
                logger.LogInformation(
                    "DbSeeder: auto-seed disabled (Sarh:AutoSeedDemo=false). " +
                    "Load the demo dataset on demand from the landing page or POST /api/v1/demo-data/load.");
                return;
            }

            var demo = scope.ServiceProvider.GetRequiredService<DemoDataService>();
            var inserted = await demo.ImportFromFileAsync(ct);
            var total = inserted.Values.Sum();

            var cc = await db.Citizens.CountAsync(ct);
            var pc = await db.Properties.CountAsync(ct);
            var ac = await db.AuthUsers.CountAsync(ct);
            logger.LogInformation(
                "DbSeeder: ready (imported {N} new row(s)). citizens={C}, properties={P}, auth_users={A}.",
                total, cc, pc, ac);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DbSeeder: error during seed.");
        }
    }

    private async Task<bool> WaitForDatabaseAsync(SarhDbContext db, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= ConnectRetries; attempt++)
        {
            if (await db.Database.CanConnectAsync(ct)) return true;
            if (attempt == ConnectRetries) break;
            logger.LogInformation("DbSeeder: database not ready ({A}/{T}), retrying…", attempt, ConnectRetries);
            await Task.Delay(ConnectRetryDelay, ct);
        }
        return false;
    }
}
