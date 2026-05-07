using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Auth;

public sealed class SignInRequest
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
}

public sealed class SignInWithPinRequest
{
    public string DigitalIdNumber { get; set; } = "";
    public string Pin { get; set; } = "";
}

public sealed class SignInUser
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public required string Role { get; init; }
    public string? OfficerId { get; init; }
    public string? CitizenId { get; init; }
}

public sealed class SignInResponse
{
    public required string AccessToken { get; init; }
    public required string RefreshToken { get; init; }
    public string TokenType { get; init; } = "bearer";
    public required int ExpiresIn { get; init; }
    public required SignInUser User { get; init; }
}

public sealed class AuthService(SarhDbContext db, JwtTokenService jwt)
{
    public async Task<SignInResponse> SignInWithPinAsync(SignInWithPinRequest dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.DigitalIdNumber) || string.IsNullOrWhiteSpace(dto.Pin))
        {
            throw SarhException.Validation(
                "رقم الهوية الرقمية ورمز PIN مطلوبان.",
                "Digital ID number and PIN are required.");
        }

        var did = dto.DigitalIdNumber.Trim();
        var card = await db.DigitalIdCards.AsNoTracking()
            .Where(c => c.DigitalIdNumber == did)
            .FirstOrDefaultAsync(ct)
            ?? throw SarhException.Unauthorized();

        if (card.Status is "revoked" or "expired" or "lost")
            throw SarhException.Unauthorized();
        if (string.IsNullOrEmpty(card.PinHash))
            throw SarhException.Unauthorized();
        if (!BCrypt.Net.BCrypt.Verify(dto.Pin, card.PinHash))
            throw SarhException.Unauthorized();

        var citizen = await db.Citizens.AsNoTracking()
            .Where(c => c.Id == card.CitizenId)
            .FirstOrDefaultAsync(ct)
            ?? throw SarhException.Unauthorized();

        var authUser = citizen.AuthUserId is Guid auid
            ? await db.AuthUsers.AsNoTracking().Where(u => u.Id == auid).FirstOrDefaultAsync(ct)
            : null;

        var payload = new SarhJwtPayload
        {
            Sub = (authUser?.Id ?? citizen.Id).ToString(),
            Email = authUser?.Email ?? $"{did}@digital-id.sarh.ly",
            SarhRole = "citizen",
            CitizenId = citizen.Id.ToString(),
            OfficerId = null,
        };
        var (token, expiresIn) = jwt.SignAccessToken(payload);

        var refresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        return new SignInResponse
        {
            AccessToken = token,
            RefreshToken = refresh,
            ExpiresIn = expiresIn,
            User = new SignInUser
            {
                Id = (authUser?.Id ?? citizen.Id).ToString(),
                Email = authUser?.Email ?? $"{did}@digital-id.sarh.ly",
                Role = "citizen",
                OfficerId = null,
                CitizenId = citizen.Id.ToString(),
            },
        };
    }

    public async Task<SignInResponse> SignInAsync(SignInRequest dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
        {
            throw SarhException.Validation(
                "البريد الإلكتروني وكلمة المرور مطلوبان.",
                "Email and password are required.");
        }

        var email = dto.Email.Trim().ToLowerInvariant();
        var user = await db.AuthUsers.AsNoTracking()
            .Where(u => u.Email == email)
            .FirstOrDefaultAsync(ct)
            ?? throw SarhException.Unauthorized();

        var ok = BCrypt.Net.BCrypt.Verify(dto.Password, user.EncryptedPassword);
        if (!ok) throw SarhException.Unauthorized();

        var officer = await db.Officers.AsNoTracking()
            .Where(o => o.AuthUserId == user.Id)
            .FirstOrDefaultAsync(ct);

        var (role, citizenId) = ResolveRoleAndCitizen(user, officer);
        if (role is null) throw SarhException.Unauthorized();

        var payload = new SarhJwtPayload
        {
            Sub = user.Id.ToString(),
            Email = user.Email,
            SarhRole = role,
            CitizenId = citizenId,
            OfficerId = officer?.IsActive == true ? officer.Id.ToString() : null,
            RegionId = officer?.RegionId,
            MunicipalityId = officer?.MunicipalityId,
        };
        var (token, expiresIn) = jwt.SignAccessToken(payload);

        // Stamp last_sign_in_at (best-effort; raw SQL avoids tracking churn).
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "UPDATE auth_users SET last_sign_in_at = SYSDATETIMEOFFSET() WHERE id = {0}",
                new object[] { user.Id }, ct);
        }
        catch { /* non-critical */ }

        var refresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        return new SignInResponse
        {
            AccessToken = token,
            RefreshToken = refresh,
            ExpiresIn = expiresIn,
            User = new SignInUser
            {
                Id = user.Id.ToString(),
                Email = user.Email,
                Role = role,
                OfficerId = officer?.IsActive == true ? officer.Id.ToString() : null,
                CitizenId = citizenId,
            },
        };
    }

    private static (string? Role, string? CitizenId) ResolveRoleAndCitizen(AuthUser user, Officer? officer)
    {
        string? appRole = null;
        string? citizenId = null;
        if (!string.IsNullOrWhiteSpace(user.RawAppMetaData))
        {
            try
            {
                using var doc = JsonDocument.Parse(user.RawAppMetaData);
                if (doc.RootElement.TryGetProperty("sarh_role", out var r) && r.ValueKind == JsonValueKind.String)
                    appRole = r.GetString();
                if (doc.RootElement.TryGetProperty("citizen_id", out var c) && c.ValueKind == JsonValueKind.String)
                    citizenId = c.GetString();
            }
            catch { /* ignore malformed JSON */ }
        }
        var role = (officer?.IsActive == true ? officer.Role : null) ?? appRole;
        return (role, citizenId);
    }
}
