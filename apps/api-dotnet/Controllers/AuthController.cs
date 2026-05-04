using Microsoft.AspNetCore.Mvc;
using Sijilli.Api.Audit;
using Sijilli.Api.Auth;

namespace Sijilli.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("sign-in")]
    [Audit(Action = AuditActions.Login, Entity = "auth_users", EntityIdFrom = "user.id", CaptureRequestBody = false)]
    public Task<SignInResponse> SignIn([FromBody] SignInRequest dto, CancellationToken ct)
        => auth.SignInAsync(dto, ct);
}
