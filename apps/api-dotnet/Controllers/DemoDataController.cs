using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data.DemoData;

namespace Sarh.Api.Controllers;

// Demo dataset management. The status + load endpoints are PUBLIC so a fresh
// deployment can be populated from the landing page with no login; load only
// works while the DB is empty (first-run), so it can't be abused to clobber a
// populated instance. Destructive operations (truncate/reset/export) are
// super_admin only.
[ApiController]
[Route("api/v1/demo-data")]
[Authorize]
public class DemoDataController(DemoDataService demo) : ControllerBase
{
    // Public — drives the landing page "load demo data" button visibility.
    [HttpGet("status")]
    [AllowAnonymous]
    public async Task<object> Status(CancellationToken ct)
    {
        var s = await demo.StatusAsync(ct);
        return new
        {
            empty = s.Empty,
            seed_file_available = s.SeedFileAvailable,
            can_load = s.Empty && s.SeedFileAvailable,
            counts = s.Counts,
        };
    }

    // Public, but a no-op guard: only loads when the DB is empty (first run).
    [HttpPost("load")]
    [AllowAnonymous]
    public async Task<object> Load(CancellationToken ct)
    {
        var status = await demo.StatusAsync(ct);
        if (!status.Empty)
            throw SarhException.Conflict(
                "تحتوي قاعدة البيانات على بيانات بالفعل — لا يمكن تحميل البيانات التجريبية فوقها.",
                "Database already has data — demo load is only allowed on a fresh database.");
        if (!status.SeedFileAvailable)
            throw SarhException.NotFound(
                "ملف البيانات التجريبية غير متوفر على الخادم.",
                "Demo seed file is not available on the server.");

        var inserted = await demo.ImportFromFileAsync(ct);
        return new { loaded = true, inserted, total = inserted.Values.Sum() };
    }

    // ---- super_admin only --------------------------------------------

    // Regenerate the committed seed file from the live DB (capture current state).
    [HttpGet("export")]
    [OfficerOnly("super_admin")]
    public async Task<object> Export(CancellationToken ct)
    {
        var total = await demo.ExportToFileAsync(ct);
        return new { exported = true, total, file = demo.SeedFilePath() };
    }

    // Clear the demo dataset (scoped to seeded ids, admin preserved).
    [HttpPost("truncate")]
    [OfficerOnly("super_admin")]
    public async Task<object> Truncate(CancellationToken ct)
    {
        var deleted = await demo.TruncateAsync(ct);
        return new { truncated = true, deleted, total = deleted.Values.Sum() };
    }

    // Truncate then re-import — a clean reset to the canonical demo state.
    [HttpPost("reset")]
    [OfficerOnly("super_admin")]
    public async Task<object> Reset(CancellationToken ct)
    {
        var deleted = await demo.TruncateAsync(ct);
        var inserted = await demo.ImportFromFileAsync(ct);
        return new { reset = true, deleted, inserted };
    }
}
