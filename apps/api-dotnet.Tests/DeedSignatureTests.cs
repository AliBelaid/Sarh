using System.Security.Cryptography.X509Certificates;
using System.Text;
using Sarh.Api.Workflow;

namespace Sarh.Api.Tests;

public class DeedSignatureTests
{
    private static X509Certificate2 NewCert()
    {
        var now = DateTimeOffset.UtcNow;
        return DeedSigningCertificate.CreateSelfSigned("CN=Sarh Test Authority, O=LVCT, C=LY",
            now.AddDays(-1), now.AddYears(1));
    }

    private static byte[] DeedBytes() => Encoding.UTF8.GetBytes("%PDF-1.7 fake deed content for LY-11-2026-000007");

    [Fact]
    public void SignThenVerify_RoundTrips()
    {
        using var cert = NewCert();
        var content = DeedBytes();

        var signature = DeedSignature.Sign(cert, content);
        var result = DeedSignature.Verify(content, signature);

        Assert.True(result.Valid);
    }

    [Fact]
    public void Verify_ExposesSignerAndSigningTime()
    {
        using var cert = NewCert();
        var content = DeedBytes();

        var result = DeedSignature.Verify(content, DeedSignature.Sign(cert, content));

        Assert.Contains("Sarh Test Authority", result.SignerSubject);
        Assert.Equal(cert.Thumbprint, result.SignerThumbprint);
        Assert.NotNull(result.SignedAt);
    }

    [Fact]
    public void Verify_FailsWhenContentTampered()
    {
        using var cert = NewCert();
        var content = DeedBytes();
        var signature = DeedSignature.Sign(cert, content);

        var tampered = (byte[])content.Clone();
        tampered[^1] ^= 0xFF; // flip a bit in the last byte

        var result = DeedSignature.Verify(tampered, signature);
        Assert.False(result.Valid);
    }

    [Fact]
    public void Verify_FailsForGarbageSignature()
    {
        var content = DeedBytes();
        var result = DeedSignature.Verify(content, new byte[] { 1, 2, 3, 4, 5 });
        Assert.False(result.Valid);
    }

    [Fact]
    public void Verify_FailsWhenSignedByDifferentContent()
    {
        using var cert = NewCert();
        var signature = DeedSignature.Sign(cert, DeedBytes());

        var other = Encoding.UTF8.GetBytes("%PDF-1.7 a completely different deed");
        var result = DeedSignature.Verify(other, signature);

        Assert.False(result.Valid);
    }

    [Fact]
    public void GeneratedCert_HasUsablePrivateKeyForSigning()
    {
        using var cert = NewCert();
        Assert.True(cert.HasPrivateKey);
    }
}
