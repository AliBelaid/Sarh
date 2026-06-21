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

public sealed class AuthService(SarhDbContext db, JwtTokenService jwt, ILogger<AuthService> log)
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
            .FirstOrDefaultAsync(ct);

        // "No such card", "no PIN set" and "wrong PIN" all return the SAME generic
        // message on purpose — distinguishing them would let an attacker enumerate
        // which digital IDs exist (and which lack a PIN) and confirm PINs. On the
        // card-missing / no-PIN paths we still run a bcrypt verify against a
        // throwaway hash so the response time matches the real-PIN path and can't
        // be used as a timing oracle. The precise reason is logged server-side so
        // we can still diagnose a failed login from the API log.
        if (card is null)
        {
            BCrypt.Net.BCrypt.Verify(dto.Pin, DummyPinHash);
            log.LogInformation("PIN login rejected: no card for digital_id_number '{Did}'", did);
            throw InvalidPinCredentials();
        }

        if (string.IsNullOrEmpty(card.PinHash))
        {
            BCrypt.Net.BCrypt.Verify(dto.Pin, DummyPinHash);
            log.LogInformation("PIN login rejected: card '{Did}' has no PIN set (officer must reset PIN)", did);
            throw InvalidPinCredentials();
        }

        if (!BCrypt.Net.BCrypt.Verify(dto.Pin, card.PinHash))
        {
            log.LogInformation("PIN login rejected: wrong PIN for card '{Did}'", did);
            throw InvalidPinCredentials();
        }

        // PIN verified — now safe to reveal card-state details to the legitimate
        // holder. An inactive (frozen/revoked/expired/lost) card can't sign in.
        if (card.Status is not "active")
        {
            log.LogInformation("PIN login rejected: card '{Did}' is '{Status}'", did, card.Status);
            throw CardNotActive(card.Status);
        }

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

    // A valid bcrypt hash (work factor 10) used only to equalize the timing of
    // the "no card" / "no PIN" rejection paths with a real PIN verification, so
    // the response time can't reveal whether a digital ID exists.
    private static readonly string DummyPinHash =
        BCrypt.Net.BCrypt.HashPassword("sarh-timing-equalizer", 10);

    // Generic invalid-credentials for the PIN flow. Used for "no such card",
    // "no PIN set" and "wrong PIN" so none can be told apart by a caller.
    private static SarhException InvalidPinCredentials() =>
        new(401, "ERR_INVALID_CREDENTIALS",
            "رقم الهوية الرقمية أو رمز PIN غير صحيح.",
            "Digital ID number or PIN is incorrect.");

    // Card-state message shown only after the PIN has been verified (so it never
    // leaks to someone who doesn't already hold the card).
    private static SarhException CardNotActive(string status)
    {
        var ar = status switch
        {
            "frozen" => "بطاقتك مجمّدة مؤقتاً. يرجى مراجعة مكتب الإصدار.",
            "revoked" => "بطاقتك ملغاة ولا يمكن استخدامها. يرجى مراجعة مكتب الإصدار.",
            "expired" => "انتهت صلاحية بطاقتك. يرجى مراجعة مكتب الإصدار لإعادة إصدارها.",
            "lost" => "بطاقتك مُبلّغ عنها كمفقودة. يرجى مراجعة مكتب الإصدار.",
            _ => "بطاقتك غير مفعّلة حالياً. يرجى مراجعة مكتب الإصدار.",
        };
        return new SarhException(403, "ERR_CARD_NOT_ACTIVE", ar,
            $"Your card is not active (status: {status}).");
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
