namespace Sarh.Api.Notifications;

// Dev/default SMS sender: writes the message to the log instead of sending it.
// Lets the full approve/reject/issue → SMS pipeline run without a gateway
// account. Always succeeds with a synthetic provider id so delivery_status
// reads 'sent' in dev.
public sealed class LogSmsSender(ILogger<LogSmsSender> log) : ISmsSender
{
    public string Provider => "log";

    public Task<SmsResult> SendAsync(string toE164, string message, CancellationToken ct)
    {
        log.LogInformation("[SMS:log] → {To}: {Message}", toE164, message);
        return Task.FromResult(SmsResult.Ok($"log-{Guid.NewGuid():N}"));
    }
}
