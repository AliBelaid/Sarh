using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Sarh.Api.Storage;

namespace Sarh.Api.Blockchain;

// Local-FS stand-in for a real IPFS pinning service. The "CID" is the SHA-256
// of the bytes (base32-style hex), and the JSON is parked under the
// "ipfs-stub" bucket so verify can serve it without touching a real node.
public sealed class StubIpfsService(IOptions<IpfsOptions> opts, StorageService storage) : IIpfsService
{
    private readonly IpfsOptions _opts = opts.Value;
    private const string Bucket = "ipfs-stub";

    public async Task<IpfsPinResult> PinJsonAsync(string json, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        var sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        // Pseudo-CID. Real IPFS uses base32-multihash; we just want a stable
        // identifier that round-trips through the gateway URL.
        var cid = "bafk" + sha256[..52];
        var path = $"{cid}.json";

        await storage.WriteRawAsync(Bucket, path, bytes, "application/json", ct);

        return new IpfsPinResult
        {
            IpfsUri = $"ipfs://{cid}",
            Cid = cid,
            Sha256 = sha256,
        };
    }

    public string GatewayUrlFor(string ipfsUri)
    {
        if (!ipfsUri.StartsWith("ipfs://", StringComparison.Ordinal)) return ipfsUri;
        var cid = ipfsUri["ipfs://".Length..];
        return $"{_opts.GatewayUrl.TrimEnd('/')}/{cid}";
    }
}
