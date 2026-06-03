namespace Sarh.Api.Notifications;

// Bound to "Sarh:Sms". Dev default = "log" (no network): SMS bodies are
// written to the application log so the approve/reject/issue flows can be
// exercised without a gateway account. Set SMS_GATEWAY_URL (or Sarh:Sms:Mode
// =libyana) to send through the real Libyana SMS gateway.
public sealed class SmsOptions
{
    public const string SectionName = "Sarh:Sms";

    // "auto"    → libyana when GatewayUrl is set, else log.
    // "libyana" → force the HTTP gateway.
    // "log"     → force the log-only sender.
    public string Mode { get; set; } = "auto";

    // HTTP endpoint of the Libyana SMS gateway. Empty → log mode.
    public string GatewayUrl { get; set; } = "";

    // Auth — gateways vary; we support an API key and/or basic user/pass.
    public string ApiKey { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";

    // Alphanumeric/short-code sender id shown to the recipient.
    public string SenderId { get; set; } = "SARH";

    public bool UseGateway =>
        Mode.Equals("libyana", StringComparison.OrdinalIgnoreCase)
        || (Mode.Equals("auto", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(GatewayUrl));
}
