using Sarh.Api.Notifications;

namespace Sarh.Api.Tests;

public class LibyanPhoneTests
{
    [Theory]
    [InlineData("0912345678", "+218912345678")]   // national trunk 0
    [InlineData("912345678", "+218912345678")]    // bare subscriber
    [InlineData("+218912345678", "+218912345678")] // already E.164
    [InlineData("00218912345678", "+218912345678")] // 00 international prefix
    [InlineData("218912345678", "+218912345678")]  // country code, no plus
    [InlineData("091-234-5678", "+218912345678")]  // separators stripped
    [InlineData(" 091 234 5678 ", "+218912345678")] // spaces stripped
    [InlineData("0942345678", "+218942345678")]    // 094 mobile range
    public void Normalize_AcceptsLibyanMobileFormats(string raw, string expected)
    {
        Assert.Equal(expected, LibyanPhone.Normalize(raw));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("021123456")]      // landline (0 trunk, leading 2 → not mobile)
    [InlineData("0812345678")]     // doesn't start with 9 after trunk
    [InlineData("091234")]         // too short
    [InlineData("09123456789")]    // too long
    [InlineData("abcdefg")]        // no digits
    public void Normalize_RejectsInvalid(string? raw)
    {
        Assert.Null(LibyanPhone.Normalize(raw));
    }

    [Fact]
    public void Compose_JoinsTitleAndBody()
    {
        Assert.Equal("تم اعتماد عقارك: رمز العقار LY-11", SmsText.Compose("تم اعتماد عقارك", "رمز العقار LY-11"));
    }

    [Fact]
    public void Compose_HandlesEmptyTitleOrBody()
    {
        Assert.Equal("body only", SmsText.Compose("", "body only"));
        Assert.Equal("title only", SmsText.Compose("title only", ""));
        Assert.Equal("title only", SmsText.Compose("title only", null));
    }

    [Fact]
    public void Compose_TruncatesOverLongText()
    {
        var body = new string('x', 1000);
        var text = SmsText.Compose("t", body);
        Assert.Equal(SmsText.MaxLength, text.Length);
        Assert.EndsWith("…", text);
    }
}
