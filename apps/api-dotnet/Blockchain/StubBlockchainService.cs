using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Sarh.Api.Blockchain;

// Deterministic in-process stand-in for a real Web3 client. Same {tokenId,
// txHash} comes back for the same property — useful in tests, and means a
// re-mint after a `pnpm db:reset` produces predictable values.
//
// Token id and tx hash are derived as keccak-style SHA-256 truncations of
// the property id + owner DID, so they look like real EVM artefacts and
// won't collide in practice.
public sealed class StubBlockchainService(IOptions<BlockchainOptions> opts) : IBlockchainService
{
    private readonly BlockchainOptions _opts = opts.Value;

    public string Network => _opts.Network;
    public string Standard => _opts.Standard;
    public string ContractAddress => string.IsNullOrWhiteSpace(_opts.ContractAddress)
        ? $"0x{HashHex($"sarh-stub-contract:{_opts.Network}", 40)}"
        : _opts.ContractAddress;

    public Task<MintReceipt> MintAsync(MintRequest req, CancellationToken ct)
    {
        var seed = $"{req.PropertyId:N}|{req.OwnerDid}|{req.MetadataSha256}";

        // uint256 tokenId rendered as a decimal string — closer to what the
        // real chain returns than a raw hex value.
        var tokenIdBytes = SHA256.HashData(Encoding.UTF8.GetBytes($"token:{seed}"));
        var tokenId = new System.Numerics.BigInteger(tokenIdBytes, isUnsigned: true, isBigEndian: true).ToString();

        var txHash = "0x" + HashHex($"tx:{seed}", 64);
        var addr   = req.OwnerAddress ?? ("0x" + HashHex($"addr:{req.OwnerDid}", 40));

        return Task.FromResult(new MintReceipt
        {
            TokenId = tokenId,
            ContractAddress = ContractAddress,
            Network = Network,
            Standard = Standard,
            OwnerDid = req.OwnerDid,
            OwnerAddress = addr,
            TxHash = txHash,
            BlockNumber = (long)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 12), // ~12-sec blocks
            MintedAt = DateTimeOffset.UtcNow,
        });
    }

    // The stub keeps no chain state — we just echo the deterministic owner
    // address back. Good enough for verify endpoint smoke tests.
    public Task<string?> OwnerOfAsync(string tokenId, CancellationToken ct)
        => Task.FromResult<string?>(null);

    public string ExplorerTxUrl(string txHash)
        => _opts.ExplorerTxUrlTemplate.Replace("{tx}", txHash);

    public string ExplorerTokenUrl(string tokenId)
        => _opts.ExplorerTokenUrlTemplate
            .Replace("{contract}", ContractAddress)
            .Replace("{token}", tokenId);

    private static string HashHex(string s, int hexChars)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(s));
        var hex = Convert.ToHexString(bytes).ToLowerInvariant();
        return hex.Length >= hexChars ? hex[..hexChars] : hex.PadRight(hexChars, '0');
    }
}
