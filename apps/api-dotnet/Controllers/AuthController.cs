using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("sign-in")]
    [Audit(Action = AuditActions.Login, Entity = "auth_users", EntityIdFrom = "user.id", CaptureRequestBody = false)]
    public Task<SignInResponse> SignIn([FromBody] SignInRequest dto, CancellationToken ct)
        => auth.SignInAsync(dto, ct);
}
