using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.Auth;

/// <summary>Authorize-style attribute that requires <c>sarh_role</c> ∈ allowed.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public class RequireRoleAttribute : Attribute, IAsyncActionFilter
{
    private readonly string[] _allowed;
    public RequireRoleAttribute(params string[] allowed) => _allowed = allowed;

    public Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var role = ctx.HttpContext.User.FindFirst("sarh_role")?.Value;
        if (string.IsNullOrEmpty(role)) throw SarhException.Unauthorized();
        if (!_allowed.Contains(role)) throw SarhException.Forbidden();
        return next();
    }
}

/// <summary>Convenience attribute for officer-only endpoints.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class OfficerOnlyAttribute(params string[] allowed) : RequireRoleAttribute(allowed);
