namespace Sarh.Api.Common;

// Named rate-limit policies + their partition-key resolvers. App-level limiting
// is DEFENSE IN DEPTH: the edge nginx already throttles /auth/* and /verify/*
// (infra/nginx), but a direct hit on the API (internal network, misrouted
// deploy) would bypass that. These limits mirror the nginx zones.
//
// The key resolvers are pure so they can be unit-tested without an HttpContext.
public static class RateLimitPolicies
{
    public const string Auth = "auth";   // pre-auth: partition by client IP
    public const string Write = "write"; // authenticated writes: by subject, else IP

    // Best-effort client IP for partitioning. Behind nginx the real client is
    // the FIRST hop in X-Forwarded-For; fall back to the socket remote address.
    public static string ClientKey(string? xForwardedFor, string? remoteIp)
    {
        if (!string.IsNullOrWhiteSpace(xForwardedFor))
        {
            var first = xForwardedFor.Split(',')[0].Trim();
            if (first.Length > 0) return first;
        }
        return string.IsNullOrWhiteSpace(remoteIp) ? "unknown" : remoteIp!;
    }

    // Write-policy key: prefer the JWT subject so a NAT'd office of officers
    // sharing one egress IP isn't throttled as a single client; else the IP.
    public static string WriteKey(string? sub, string? xForwardedFor, string? remoteIp)
        => !string.IsNullOrWhiteSpace(sub)
            ? $"sub:{sub}"
            : $"ip:{ClientKey(xForwardedFor, remoteIp)}";
}

// Bound to "Sarh:RateLimit". Enabled by default; limits mirror the nginx zones
// (auth 10/min, writes 30/min). Set RATE_LIMIT_ENABLED=false to turn the app
// layer off (e.g. when load-testing behind the trusted proxy).
public sealed class RateLimitOptions
{
    public const string SectionName = "Sarh:RateLimit";

    public bool Enabled { get; set; } = true;
    public int AuthPermitPerMinute { get; set; } = 10;
    public int WritePermitPerMinute { get; set; } = 30;
}
