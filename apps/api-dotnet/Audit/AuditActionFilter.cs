using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.Audit;

// Global action filter that fires after a controller handler succeeds.
// Looks up the [Audit] attribute on the action method (if any), buffers
// the inbound request body and the outbound response, and writes a row
// to audit_log via AuditService.
//
// The interceptor is intentionally synchronous-await: any audit write
// failure is swallowed inside AuditService.RecordAsync, so the request
// completes either way.
public sealed class AuditActionFilter(AuditService audit) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var attr = (ctx.ActionDescriptor as ControllerActionDescriptor)
            ?.MethodInfo.GetCustomAttributes(typeof(AuditAttribute), inherit: false)
            .OfType<AuditAttribute>()
            .FirstOrDefault();
        if (attr is null) { await next(); return; }

        // Capture the inbound DTO before the action runs (so we still have
        // it after model binding has attached it as an argument).
        var inbound = attr.CaptureRequestBody
            ? ctx.ActionArguments.Values.FirstOrDefault(IsLikelyDto)
            : null;

        var executed = await next();
        if (executed.Exception is not null && !executed.ExceptionHandled) return;

        var body = (executed.Result as Microsoft.AspNetCore.Mvc.ObjectResult)?.Value;
        // ApiController auto-wraps return values in OkObjectResult on success;
        // when handlers return Task<T> directly it's already the raw T.
        body ??= ResultValueViaReflection(executed.Result);

        var actor = ResolveActor(ctx.HttpContext.User);
        // Sign-in requests are anonymous (no JWT yet), so the principal carries no
        // actor and ResolveActor falls back to "system". Recover who actually
        // signed in from the response body's `user` object, so the audit page
        // attributes a login to the citizen/officer by name instead of "system".
        if (actor.Kind == "system" && attr.Action == AuditActions.Login)
            actor = ResolveLoginActorFromBody(body) ?? actor;
        var entityId = PickEntityId(body, attr.EntityIdFrom ?? "id");

        var entry = new AuditEntry
        {
            ActorKind = actor.Kind,
            ActorId = actor.Id,
            Action = attr.Action,
            EntityTable = attr.Entity,
            EntityId = entityId,
            BeforeStateJson = inbound is null ? null : JsonSerializer.Serialize(inbound, JsonDefaults.Options),
            AfterStateJson = (body is null || !attr.CaptureResponseBody) ? null : JsonSerializer.Serialize(body, JsonDefaults.Options),
            IpAddress = RequestIp(ctx.HttpContext),
            UserAgent = ctx.HttpContext.Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null,
        };
        await audit.RecordAsync(entry, ctx.HttpContext.RequestAborted);
    }

    private static (string Kind, Guid? Id) ResolveActor(System.Security.Claims.ClaimsPrincipal principal)
    {
        if (!principal.Identity?.IsAuthenticated ?? true) return ("system", null);
        var officerId = principal.FindFirst("officer_id")?.Value;
        if (Guid.TryParse(officerId, out var oid)) return ("officer", oid);
        var citizenId = principal.FindFirst("citizen_id")?.Value;
        if (Guid.TryParse(citizenId, out var cid)) return ("citizen", cid);
        var sub = principal.FindFirst("sub")?.Value;
        return ("system", Guid.TryParse(sub, out var sid) ? sid : null);
    }

    // Pulls the signed-in actor out of a SignInResponse body. The shape is
    // { user: { officer_id, citizen_id, ... } } — officer wins over citizen.
    private static (string Kind, Guid? Id)? ResolveLoginActorFromBody(object? body)
    {
        if (body is null) return null;
        var doc = JsonSerializer.SerializeToElement(body, JsonDefaults.Options);
        if (doc.ValueKind != JsonValueKind.Object
            || !doc.TryGetProperty("user", out var user)
            || user.ValueKind != JsonValueKind.Object)
            return null;

        if (user.TryGetProperty("officer_id", out var oid)
            && oid.ValueKind == JsonValueKind.String
            && Guid.TryParse(oid.GetString(), out var officerId))
            return ("officer", officerId);

        if (user.TryGetProperty("citizen_id", out var cid)
            && cid.ValueKind == JsonValueKind.String
            && Guid.TryParse(cid.GetString(), out var citizenId))
            return ("citizen", citizenId);

        return null;
    }

    private static string? RequestIp(HttpContext http)
    {
        var fwd = http.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrEmpty(fwd)) return fwd.Split(',')[0].Trim();
        return http.Connection.RemoteIpAddress?.ToString();
    }

    private static Guid? PickEntityId(object? payload, string path)
    {
        if (payload is null) return null;
        // Convert via JSON so we can walk dotted paths regardless of the
        // payload's static C# type. Cheap because audit volume is low.
        var doc = JsonSerializer.SerializeToElement(payload, JsonDefaults.Options);
        foreach (var part in path.Split('.'))
        {
            if (doc.ValueKind != JsonValueKind.Object) return null;
            if (!doc.TryGetProperty(part, out var next)) return null;
            doc = next;
        }
        if (doc.ValueKind != JsonValueKind.String) return null;
        return Guid.TryParse(doc.GetString(), out var g) ? g : null;
    }

    private static bool IsLikelyDto(object? v)
    {
        if (v is null) return false;
        var t = v.GetType();
        return !t.IsPrimitive && t != typeof(string) && t != typeof(Guid) && t != typeof(CancellationToken);
    }

    private static object? ResultValueViaReflection(Microsoft.AspNetCore.Mvc.IActionResult? result)
    {
        if (result is null) return null;
        var prop = result.GetType().GetProperty("Value");
        return prop?.GetValue(result);
    }
}
