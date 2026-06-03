namespace Sarh.Api.Notifications;

// Outbound SMS abstraction. Two impls behind it — LibyanaSmsSender (real HTTP
// gateway) and LogSmsSender (dev fallback that just logs) — selected by
// Sarh:Sms:Mode / SMS_GATEWAY_URL, mirroring the ISsiService / IBlockchainService
// pattern. Implementations never throw: a failed send returns SmsResult.Fail
// so notification delivery is best-effort and never breaks the calling flow.
public interface ISmsSender
{
    // Provider label recorded in logs (e.g. "log", "libyana").
    string Provider { get; }

    // toE164 is a normalised +218… number (see LibyanPhone). message is the
    // already-composed Arabic body.
    Task<SmsResult> SendAsync(string toE164, string message, CancellationToken ct);
}

public sealed record SmsResult(bool Success, string? ProviderMessageId, string? Error)
{
    public static SmsResult Ok(string? id = null) => new(true, id, null);
    public static SmsResult Fail(string error) => new(false, null, error);
}

// Composes a single SMS body from a notification title + body, trimmed to a
// sane length. Kept pure + separate so it's unit-testable.
public static class SmsText
{
    public const int MaxLength = 480; // ~3 concatenated GSM segments.

    public static string Compose(string? titleAr, string? bodyAr)
    {
        var title = (titleAr ?? "").Trim();
        var body = (bodyAr ?? "").Trim();
        var text = string.IsNullOrEmpty(title)
            ? body
            : string.IsNullOrEmpty(body) ? title : $"{title}: {body}";
        text = text.Trim();
        return text.Length <= MaxLength ? text : text[..(MaxLength - 1)] + "…";
    }
}
