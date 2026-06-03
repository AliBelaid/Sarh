using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Sarh.Api.Notifications;

// Sends SMS through the Libyana HTTP gateway. Gateways differ in their exact
// contract, so this posts a conventional JSON envelope ({to, from, text}) with
// the configured auth — adjust the body shape here to match the operator's
// spec when the account is provisioned. Resilient by design: any transport or
// non-2xx response yields SmsResult.Fail (logged) rather than throwing, so a
// gateway outage never breaks notification delivery.
public sealed class LibyanaSmsSender(
    HttpClient http,
    IOptions<SmsOptions> options,
    ILogger<LibyanaSmsSender> log) : ISmsSender
{
    private readonly SmsOptions _opts = options.Value;

    public string Provider => "libyana";

    public async Task<SmsResult> SendAsync(string toE164, string message, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, _opts.GatewayUrl)
            {
                Content = JsonContent.Create(new
                {
                    to = toE164,
                    from = _opts.SenderId,
                    text = message,
                }),
            };

            // Auth: API key header and/or HTTP basic, whichever is configured.
            if (!string.IsNullOrEmpty(_opts.ApiKey))
                req.Headers.TryAddWithoutValidation("x-api-key", _opts.ApiKey);
            if (!string.IsNullOrEmpty(_opts.Username))
            {
                var basic = Convert.ToBase64String(
                    System.Text.Encoding.UTF8.GetBytes($"{_opts.Username}:{_opts.Password}"));
                req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
            }

            using var res = await http.SendAsync(req, ct);
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                log.LogWarning("Libyana SMS → {To} failed: {Status} {Body}",
                    toE164, (int)res.StatusCode, Truncate(text, 300));
                return SmsResult.Fail($"gateway {(int)res.StatusCode}");
            }

            return SmsResult.Ok(ExtractMessageId(text));
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Libyana SMS → {To} threw.", toE164);
            return SmsResult.Fail(ex.Message);
        }
    }

    private static string? ExtractMessageId(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            foreach (var key in new[] { "message_id", "messageId", "id", "sid" })
                if (doc.RootElement.ValueKind == JsonValueKind.Object
                    && doc.RootElement.TryGetProperty(key, out var v))
                    return v.ToString();
        }
        catch { /* non-JSON response — no id to extract */ }
        return null;
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
