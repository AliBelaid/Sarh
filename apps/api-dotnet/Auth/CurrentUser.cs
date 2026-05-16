using System.Security.Claims;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.Auth;

public sealed record CurrentUser(
    Guid AuthUserId,
    string? Email,
    string Role,
    Guid? OfficerId,
    Guid? CitizenId,
    int? RegionId,
    int? MunicipalityId);

public static class CurrentUserExtensions
{
    public static CurrentUser RequireUser(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirst("sub")?.Value;
        var role = principal.FindFirst("sarh_role")?.Value;
        if (sub is null || role is null) throw SarhException.Unauthorized();

        return new CurrentUser(
            AuthUserId: Guid.Parse(sub),
            Email: principal.FindFirst("email")?.Value,
            Role: role,
            OfficerId: TryGuid(principal.FindFirst("officer_id")?.Value),
            CitizenId: TryGuid(principal.FindFirst("citizen_id")?.Value),
            RegionId: TryInt(principal.FindFirst("region_id")?.Value),
            MunicipalityId: TryInt(principal.FindFirst("municipality_id")?.Value));
    }

    public static CurrentUser? RequireUserOrNull(this ClaimsPrincipal? principal)
    {
        if (principal is null) return null;
        var sub = principal.FindFirst("sub")?.Value;
        var role = principal.FindFirst("sarh_role")?.Value;
        if (sub is null || role is null) return null;

        return new CurrentUser(
            AuthUserId: Guid.Parse(sub),
            Email: principal.FindFirst("email")?.Value,
            Role: role,
            OfficerId: TryGuid(principal.FindFirst("officer_id")?.Value),
            CitizenId: TryGuid(principal.FindFirst("citizen_id")?.Value),
            RegionId: TryInt(principal.FindFirst("region_id")?.Value),
            MunicipalityId: TryInt(principal.FindFirst("municipality_id")?.Value));
    }

    private static Guid? TryGuid(string? s) => Guid.TryParse(s, out var g) ? g : null;
    private static int? TryInt(string? s) => int.TryParse(s, out var i) ? i : null;
}
