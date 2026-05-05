using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Common.Errors;
using Sarh.Api.Storage;
using Sarh.Api.Verify;

namespace Sarh.Api.Controllers;

// Public, unauthenticated. Rate limiting is applied at the gateway
// (nginx) per CLAUDE.md security checklist — no app-side throttling here.
[ApiController]
[Route("api/v1/verify")]
[AllowAnonymous]
public class VerifyController(VerifyService verify, StorageService storage, ILogger<VerifyController> log) : ControllerBase
{
    [HttpGet("{code}")]
    public Task<PublicDeedView> ByCode(string code, CancellationToken ct)
        => verify.ByPropertyCodeAsync(code, ct);

    [HttpGet("{code}/deed.pdf")]
    public async Task<IActionResult> DownloadDeed(string code, CancellationToken ct)
    {
        var (propertyCode, deedPath, expectedHash) = await verify.ResolveDeedPathAsync(code, ct);

        // deed_pdf_path is stored as "<bucket>/<rest...>", same convention
        // the NestJS verify controller uses.
        var slash = deedPath.IndexOf('/');
        if (slash <= 0) return NotFound();
        var bucket = deedPath[..slash];
        var path = deedPath[(slash + 1)..];

        // Tamper check: read once, compare SHA-256 against the value recorded
        // at approval time, then stream the bytes. If the file on disk has
        // been modified, refuse to serve it — the verify guarantee fails
        // rather than silently delivering a forged document.
        var bytes = await storage.ReadAsync(bucket, path, ct);
        if (!string.IsNullOrEmpty(expectedHash))
        {
            var actualHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (!string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase))
            {
                log.LogWarning(
                    "Deed tamper check failed for {Code}: expected {Expected}, got {Actual}",
                    propertyCode, expectedHash, actualHash);
                throw SarhException.Conflict(
                    "تعذّر التحقّق من سلامة سند الملكية. تواصل مع الجهة المختصّة.",
                    "Deed integrity check failed.");
            }
        }

        Response.Headers["Content-Disposition"] = $"inline; filename=\"{propertyCode}.pdf\"";
        Response.Headers["X-Deed-SHA256"] = expectedHash ?? "";
        return File(bytes, "application/pdf");
    }
}
