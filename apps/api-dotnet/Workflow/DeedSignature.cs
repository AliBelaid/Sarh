using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;

namespace Sarh.Api.Workflow;

// Pure crypto core of the deed PAdES/CAdES signature: a detached CMS
// (PKCS#7 SignedData) over the deed PDF bytes, signed with SHA-256 and
// carrying a signing-time attribute. Detached means the signature (.p7s)
// lives beside the PDF and embeds the signer certificate, so each signature
// is self-verifying — no key lookup, no DB columns.
//
// This is the cryptographic substance of a PAdES-B signature. Embedding the
// CMS *inside* the PDF's /ByteRange (full ISO 32000 PAdES) needs an
// incremental-update PDF writer (iText/PDFBox); the detached form here gives
// the same tamper-evidence + signer identity guarantee with BCL only.
public static class DeedSignature
{
    private static readonly Oid Sha256 = new("2.16.840.1.101.3.4.2.1");

    // Produces the DER-encoded detached CMS signature over content.
    public static byte[] Sign(X509Certificate2 signerCert, byte[] content)
    {
        var signedCms = new SignedCms(new ContentInfo(content), detached: true);
        var signer = new CmsSigner(signerCert)
        {
            DigestAlgorithm = Sha256,
            IncludeOption = X509IncludeOption.EndCertOnly,
        };
        signer.SignedAttributes.Add(new Pkcs9SigningTime(DateTime.UtcNow));
        signedCms.ComputeSignature(signer);
        return signedCms.Encode();
    }

    // Verifies a detached CMS signature against content. verifySignatureOnly
    // checks the cryptographic signature without building a trust chain — the
    // right call for a self-signed dev authority and still valid for a
    // CA-issued production cert (chain trust is a separate, optional policy).
    public static DeedSignatureResult Verify(byte[] content, byte[] signature)
    {
        try
        {
            var signedCms = new SignedCms(new ContentInfo(content), detached: true);
            signedCms.Decode(signature);
            signedCms.CheckSignature(verifySignatureOnly: true);

            var signer = signedCms.SignerInfos.Count > 0 ? signedCms.SignerInfos[0] : null;
            var cert = signer?.Certificate;
            DateTimeOffset? signedAt = null;
            if (signer is not null)
            {
                foreach (var attr in signer.SignedAttributes)
                {
                    if (attr.Oid?.Value == "1.2.840.113549.1.9.5" // signing-time
                        && attr.Values.Count > 0
                        && attr.Values[0] is Pkcs9SigningTime st)
                    {
                        signedAt = st.SigningTime;
                    }
                }
            }

            return new DeedSignatureResult
            {
                Valid = true,
                SignerSubject = cert?.Subject,
                SignerThumbprint = cert?.Thumbprint,
                SignedAt = signedAt,
            };
        }
        catch (CryptographicException)
        {
            return new DeedSignatureResult { Valid = false };
        }
    }
}

public sealed class DeedSignatureResult
{
    public required bool Valid { get; init; }
    public string? SignerSubject { get; init; }
    public string? SignerThumbprint { get; init; }
    public DateTimeOffset? SignedAt { get; init; }
}

// Builds the self-signed signing certificate used in dev when no production
// PFX is configured. Shared by the service and its tests.
public static class DeedSigningCertificate
{
    public static X509Certificate2 CreateSelfSigned(string subject, DateTimeOffset notBefore, DateTimeOffset notAfter)
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        req.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.NonRepudiation, critical: true));
        using var ephemeral = req.CreateSelfSigned(notBefore, notAfter);
        // Round-trip through PFX so the private key is reliably associated for
        // SignedCms across platforms (Windows CNG/CAPI is finicky about keys
        // attached only in-memory by CreateSelfSigned). EphemeralKeySet keeps
        // the key out of any on-disk store.
        var pfx = ephemeral.Export(X509ContentType.Pfx);
        return new X509Certificate2(pfx, (string?)null, X509KeyStorageFlags.EphemeralKeySet);
    }
}
