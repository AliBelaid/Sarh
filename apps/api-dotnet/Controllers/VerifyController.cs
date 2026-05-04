using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sijilli.Api.Storage;
using Sijilli.Api.Verify;

namespace Sijilli.Api.Controllers;

// Public, unauthenticated. Rate limiting is applied at the gateway
// (nginx) per CLAUDE.md security checklist — no app-side throttling here.
[ApiController]
[Route("api/v1/verify")]
[AllowAnonymous]
public class VerifyController(VerifyService verify, StorageService storage) : ControllerBase
{
    [HttpGet("{code}")]
    public Task<PublicDeedView> ByCode(string code, CancellationToken ct)
        => verify.ByPropertyCodeAsync(code, ct);

    [HttpGet("{code}/deed.pdf")]
    public async Task<IActionResult> DownloadDeed(string code, CancellationToken ct)
    {
        var (propertyCode, deedPath) = await verify.ResolveDeedPathAsync(code, ct);

        // deed_pdf_path is stored as "<bucket>/<rest...>", same convention
        // the NestJS verify controller uses.
        var slash = deedPath.IndexOf('/');
        if (slash <= 0) return NotFound();
        var bucket = deedPath[..slash];
        var path = deedPath[(slash + 1)..];

        var stream = storage.OpenRead(bucket, path);
        Response.Headers["Content-Disposition"] = $"inline; filename=\"{propertyCode}.pdf\"";
        return File(stream, "application/pdf");
    }
}
