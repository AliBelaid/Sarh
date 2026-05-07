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

    [HttpPost("sign-in-with-pin")]
    [Audit(Action = AuditActions.Login, Entity = "digital_id_cards", EntityIdFrom = "user.citizen_id", CaptureRequestBody = false)]
    public Task<SignInResponse> SignInWithPin([FromBody] SignInWithPinRequest dto, CancellationToken ct)
        => auth.SignInWithPinAsync(dto, ct);
}
