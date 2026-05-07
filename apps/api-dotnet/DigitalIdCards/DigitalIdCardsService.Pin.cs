using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.DigitalIdCards;

public sealed partial class DigitalIdCardsService
{
    public async Task<ResetPinResult> ResetPinAsync(Guid cardId, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var card = await db.DigitalIdCards.FirstOrDefaultAsync(c => c.Id == cardId, ct)
            ?? throw SarhException.NotFound("البطاقة", "Card");

        if (card.Status is "revoked" or "expired")
        {
            throw SarhException.Validation(
                "لا يمكن إعادة تعيين رمز PIN لبطاقة ملغاة أو منتهية.",
                "Cannot reset PIN for a revoked or expired card.");
        }

        var pin = GenerateNumericPin(6);
        card.PinHash = BCrypt.Net.BCrypt.HashPassword(pin, 10);
        card.PinSetAt = DateTimeOffset.UtcNow;
        card.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        log.LogInformation("PIN reset for card {CardId} by officer {OfficerId}", cardId, actor.OfficerId);

        return new ResetPinResult
        {
            CardId = cardId,
            Pin = pin,
            SetAt = card.PinSetAt.Value,
        };
    }

    private static string GenerateNumericPin(int digits)
    {
        Span<byte> buf = stackalloc byte[4];
        var sb = new System.Text.StringBuilder(digits);
        for (var i = 0; i < digits; i++)
        {
            RandomNumberGenerator.Fill(buf);
            var n = BitConverter.ToUInt32(buf) % 10;
            sb.Append((char)('0' + n));
        }
        return sb.ToString();
    }
}

public sealed class ResetPinResult
{
    public required Guid CardId { get; init; }
    public required string Pin { get; init; }
    public required DateTimeOffset SetAt { get; init; }
}
