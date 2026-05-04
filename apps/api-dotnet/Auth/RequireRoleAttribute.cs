using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Sijilli.Api.Common.Errors;

namespace Sijilli.Api.Auth;

/// <summary>Authorize-style attribute that requires <c>sijilli_role</c> ∈ allowed.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public class RequireRoleAttribute : Attribute, IAsyncActionFilter
{
    private readonly string[] _allowed;
    public RequireRoleAttribute(params string[] allowed) => _allowed = allowed;

    public Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var role = ctx.HttpContext.User.FindFirst("sijilli_role")?.Value;
        if (string.IsNullOrEmpty(role)) throw SijilliException.Unauthorized();
        if (!_allowed.Contains(role)) throw SijilliException.Forbidden();
        return next();
    }
}

/// <summary>Convenience attribute for officer-only endpoints.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public sealed class OfficerOnlyAttribute(params string[] allowed) : RequireRoleAttribute(allowed);
