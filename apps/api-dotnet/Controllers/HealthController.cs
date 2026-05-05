using Microsoft.AspNetCore.Mvc;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "ok",
        service = "sarh-api-dotnet",
        timestamp = DateTimeOffset.UtcNow,
    });
}
