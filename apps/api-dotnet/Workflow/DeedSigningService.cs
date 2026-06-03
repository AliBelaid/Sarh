using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Options;

namespace Sarh.Api.Workflow;

public sealed class DeedSigningOptions
{
    public const string SectionName = "Sarh:DeedSigning";

    // Path to a PKCS#12 (.pfx) holding the production signing cert + key.
    // Empty → an ephemeral self-signed dev authority is generated at startup.
    public string CertPath { get; set; } = "";
    public string CertPassphrase { get; set; } = "";

    // Subject DN for the generated dev authority.
    public string SignerSubject { get; set; } = "CN=Sarh Deed Authority, O=LVCT, C=LY";
}

// Signs deed PDFs and verifies deed signatures. Singleton: the signing cert is
// loaded/generated once. In production set DEED_SIGNING_CERT_PATH to a CA- or
// government-issued PFX; in dev a self-signed authority is created so the full
// approve → sign → verify pipeline runs out of the box. Either way each
// detached signature embeds its signer cert, so deeds signed by an old dev
// authority stay verifiable after a restart.
public sealed class DeedSigningService : IDisposable
{
    private readonly X509Certificate2 _cert;

    public bool IsProductionCert { get; }
    public string SignerSubject => _cert.Subject;
    public string SignerThumbprint => _cert.Thumbprint;

    public DeedSigningService(IOptions<DeedSigningOptions> options, ILogger<DeedSigningService> log)
    {
        var opts = options.Value;
        if (!string.IsNullOrWhiteSpace(opts.CertPath) && File.Exists(opts.CertPath))
        {
            _cert = new X509Certificate2(
                opts.CertPath, opts.CertPassphrase,
                X509KeyStorageFlags.EphemeralKeySet);
            IsProductionCert = true;
            log.LogInformation("Deed signing: loaded certificate {Subject} ({Thumb}).",
                _cert.Subject, _cert.Thumbprint);
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(opts.CertPath))
                log.LogWarning("Deed signing cert '{Path}' not found; using an ephemeral self-signed dev authority.", opts.CertPath);
            else
                log.LogInformation("Deed signing: no cert configured; using an ephemeral self-signed dev authority. Set DEED_SIGNING_CERT_PATH in production.");

            var now = DateTimeOffset.UtcNow;
            _cert = DeedSigningCertificate.CreateSelfSigned(opts.SignerSubject, now.AddDays(-1), now.AddYears(10));
            IsProductionCert = false;
        }
    }

    public byte[] Sign(byte[] content) => DeedSignature.Sign(_cert, content);

    public DeedSignatureResult Verify(byte[] content, byte[] signature) => DeedSignature.Verify(content, signature);

    public void Dispose() => _cert.Dispose();
}
