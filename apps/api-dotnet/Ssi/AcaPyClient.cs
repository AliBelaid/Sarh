using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Sarh.Api.Ssi;

// Thin, resilient wrapper over the ACA-Py admin API (Aries Cloud Agent v1.0).
// Every method returns null / false on any transport or non-2xx error after
// logging — callers degrade gracefully rather than throwing into the issuance
// flow. The admin key goes on every request; multitenant sub-wallet calls add
// the sub-wallet's bearer token.
//
// Wire reference: infra/docker/aca-py/docker-compose.yml (multitenancy mode)
// and bootstrap-schemas.ts (schema + cred-def registration).
public sealed class AcaPyClient(
    HttpClient http,
    IOptions<SsiOptions> options,
    ILogger<AcaPyClient> log)
{
    private readonly SsiOptions _opts = options.Value;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<bool> PingAsync(CancellationToken ct)
    {
        var res = await SendAsync(HttpMethod.Get, "/status", token: null, body: null, ct);
        return res is not null;
    }

    // Creates (or returns) a managed multitenant sub-wallet for a citizen.
    public async Task<SubWallet?> CreateSubWalletAsync(string walletName, string walletKey, string label, CancellationToken ct)
    {
        var body = new
        {
            wallet_name = walletName,
            wallet_key = walletKey,
            wallet_type = "askar",
            label,
            key_management_mode = "managed",
            wallet_dispatch_type = "default",
        };
        using var doc = await SendAsync(HttpMethod.Post, "/multitenancy/wallet", token: null, body, ct);
        if (doc is null) return null;
        var root = doc.RootElement;
        var walletId = GetString(root, "wallet_id");
        var token = GetString(root, "token");
        if (walletId is null || token is null) return null;
        return new SubWallet(walletId, token);
    }

    // Creates a local DID inside a sub-wallet (method from SsiOptions.DidMethod).
    public async Task<AgentDid?> CreateDidAsync(string token, CancellationToken ct)
    {
        var method = string.IsNullOrWhiteSpace(_opts.DidMethod) ? "sov" : _opts.DidMethod;
        var body = new { method, options = new { key_type = "ed25519" } };
        using var doc = await SendAsync(HttpMethod.Post, "/wallet/did/create", token, body, ct);
        if (doc is null) return null;
        if (!doc.RootElement.TryGetProperty("result", out var result)) return null;
        var did = GetString(result, "did");
        var verkey = GetString(result, "verkey");
        if (did is null || verkey is null) return null;
        return new AgentDid(did, verkey);
    }

    // Creates a connectionless credential offer record. With the auto-respond
    // flags set in docker-compose, the exchange completes once the citizen's
    // wallet connects; we persist the cred_ex_id + state immediately.
    public async Task<CredExchange?> CreateCredentialOfferAsync(
        string token, string credDefId, IReadOnlyDictionary<string, string> attributes, CancellationToken ct)
    {
        var body = new
        {
            auto_issue = true,
            auto_remove = false,
            credential_preview = new
            {
                type = "issue-credential/2.0/credential-preview",
                attributes = attributes.Select(kv => new { name = kv.Key, value = kv.Value }).ToArray(),
            },
            filter = new { indy = new { cred_def_id = credDefId } },
        };
        using var doc = await SendAsync(HttpMethod.Post, "/issue-credential-2.0/create", token, body, ct);
        if (doc is null) return null;
        var root = doc.RootElement;
        var credExId = GetString(root, "cred_ex_id")
            ?? (root.TryGetProperty("cred_ex_record", out var rec) ? GetString(rec, "cred_ex_id") : null);
        var state = GetString(root, "state")
            ?? (root.TryGetProperty("cred_ex_record", out var rec2) ? GetString(rec2, "state") : null)
            ?? "offer_sent";
        if (credExId is null) return null;
        return new CredExchange(credExId, state);
    }

    public async Task<bool> RevokeCredentialAsync(string token, string credExId, string? comment, CancellationToken ct)
    {
        var body = new { cred_ex_id = credExId, publish = true, comment = comment ?? "revoked" };
        var doc = await SendAsync(HttpMethod.Post, "/revocation/revoke", token, body, ct);
        doc?.Dispose();
        return doc is not null;
    }

    // ---------------- transport ----------------
    private async Task<JsonDocument?> SendAsync(HttpMethod method, string path, string? token, object? body, CancellationToken ct)
    {
        try
        {
            var baseUrl = _opts.AdminUrl.TrimEnd('/');
            using var req = new HttpRequestMessage(method, $"{baseUrl}{path}");
            if (!string.IsNullOrEmpty(_opts.AdminApiKey))
                req.Headers.TryAddWithoutValidation("x-api-key", _opts.AdminApiKey);
            if (!string.IsNullOrEmpty(token))
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (body is not null)
                req.Content = JsonContent.Create(body);

            using var res = await http.SendAsync(req, ct);
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                log.LogWarning("ACA-Py {Method} {Path} → {Status}: {Body}",
                    method, path, (int)res.StatusCode, Truncate(text, 400));
                return null;
            }
            return string.IsNullOrWhiteSpace(text) ? JsonDocument.Parse("{}") : JsonDocument.Parse(text);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "ACA-Py {Method} {Path} failed.", method, path);
            return null;
        }
    }

    private static string? GetString(JsonElement el, string name) =>
        el.ValueKind == JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString()
            : null;

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    public sealed record SubWallet(string WalletId, string Token);
    public sealed record AgentDid(string Did, string Verkey);
    public sealed record CredExchange(string CredExId, string State);
}
