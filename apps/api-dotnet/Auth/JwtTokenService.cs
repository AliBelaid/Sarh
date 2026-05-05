using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.Auth;

public sealed class JwtTokenService
{
    private readonly byte[] _secretBytes;
    public int AccessTtlSeconds { get; }

    public JwtTokenService(IConfiguration cfg)
    {
        var secret = cfg["Sarh:JwtSecret"] ?? "";
        if (secret.Length < 32)
        {
            throw new InvalidOperationException(
                "Sarh:JwtSecret must be at least 32 chars. Set it in appsettings.json or env Sarh__JwtSecret.");
        }
        _secretBytes = Encoding.UTF8.GetBytes(secret);
        AccessTtlSeconds = int.TryParse(cfg["Sarh:JwtAccessTtlSeconds"], out var ttl) ? ttl : 3600;
    }

    public SecurityKey SigningKey => new SymmetricSecurityKey(_secretBytes);

    public (string token, int expiresIn) SignAccessToken(SarhJwtPayload payload)
    {
        var json = JsonSerializer.Serialize(payload);
        using var doc = JsonDocument.Parse(json);
        var claims = new List<Claim>();
        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            if (prop.Value.ValueKind == JsonValueKind.Null) continue;
            if (prop.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
            {
                claims.Add(new Claim(prop.Name, prop.Value.GetRawText(), JsonClaimValueTypes.Json));
            }
            else
            {
                claims.Add(new Claim(prop.Name, prop.Value.ToString() ?? ""));
            }
        }

        var creds = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256);
        var now = DateTimeOffset.UtcNow;
        var jwt = new JwtSecurityToken(
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddSeconds(AccessTtlSeconds).UtcDateTime,
            signingCredentials: creds);
        var token = new JwtSecurityTokenHandler().WriteToken(jwt);
        return (token, AccessTtlSeconds);
    }

    public static SarhJwtPayload FromClaimsPrincipal(ClaimsPrincipal user)
    {
        string? Get(string n) => user.FindFirst(n)?.Value;
        var sub = Get("sub") ?? throw SarhException.Unauthorized();
        var role = Get("sarh_role") ?? throw SarhException.Unauthorized();
        return new SarhJwtPayload
        {
            Sub = sub,
            SarhRole = role,
            Email = Get("email"),
            CitizenId = Get("citizen_id"),
            OfficerId = Get("officer_id"),
            RegionId = int.TryParse(Get("region_id"), out var r) ? r : null,
            MunicipalityId = int.TryParse(Get("municipality_id"), out var m) ? m : null,
        };
    }
}
