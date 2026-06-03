using Sarh.Api.Common;

namespace Sarh.Api.Tests;

public class RateLimitPoliciesTests
{
    // ---------------- ClientKey ----------------
    [Fact]
    public void ClientKey_PrefersFirstForwardedHop()
    {
        Assert.Equal("203.0.113.7",
            RateLimitPolicies.ClientKey("203.0.113.7, 10.0.0.1, 10.0.0.2", "10.0.0.5"));
    }

    [Fact]
    public void ClientKey_TrimsWhitespaceInForwardedHeader()
    {
        Assert.Equal("203.0.113.7",
            RateLimitPolicies.ClientKey("  203.0.113.7 , 10.0.0.1", "10.0.0.5"));
    }

    [Fact]
    public void ClientKey_FallsBackToRemoteIp_WhenNoForwardedHeader()
    {
        Assert.Equal("10.0.0.5", RateLimitPolicies.ClientKey(null, "10.0.0.5"));
        Assert.Equal("10.0.0.5", RateLimitPolicies.ClientKey("", "10.0.0.5"));
        Assert.Equal("10.0.0.5", RateLimitPolicies.ClientKey("   ", "10.0.0.5"));
    }

    [Fact]
    public void ClientKey_ReturnsUnknown_WhenNothingAvailable()
    {
        Assert.Equal("unknown", RateLimitPolicies.ClientKey(null, null));
        Assert.Equal("unknown", RateLimitPolicies.ClientKey("", ""));
    }

    // ---------------- WriteKey ----------------
    [Fact]
    public void WriteKey_PrefersSubjectOverIp()
    {
        Assert.Equal("sub:abc-123", RateLimitPolicies.WriteKey("abc-123", "203.0.113.7", "10.0.0.5"));
    }

    [Fact]
    public void WriteKey_FallsBackToIp_WhenNoSubject()
    {
        Assert.Equal("ip:203.0.113.7", RateLimitPolicies.WriteKey(null, "203.0.113.7", "10.0.0.5"));
        Assert.Equal("ip:10.0.0.5", RateLimitPolicies.WriteKey("", null, "10.0.0.5"));
    }

    [Fact]
    public void WriteKey_DistinguishesTwoSubjectsBehindSameIp()
    {
        var a = RateLimitPolicies.WriteKey("officer-1", "203.0.113.7", "10.0.0.5");
        var b = RateLimitPolicies.WriteKey("officer-2", "203.0.113.7", "10.0.0.5");
        Assert.NotEqual(a, b);
    }
}
