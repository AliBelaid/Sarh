using Microsoft.AspNetCore.Mvc;

namespace Sijilli.Api.Controllers;

[ApiController]
[Route("api/v1/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "ok",
        service = "sijilli-api-dotnet",
        timestamp = DateTimeOffset.UtcNow,
    });
}
