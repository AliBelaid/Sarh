namespace Sarh.Api.Blockchain;

// Thin abstraction over the on-chain operations Sarh needs. Two impls:
//   • StubBlockchainService    — deterministic fake (default in dev)
//   • EthereumBlockchainService — real Nethereum (added when going live)
//
// Both produce the same MintReceipt shape so callers don't branch on mode.
public interface IBlockchainService
{
    // The active network label baked into property_nfts.network. Exposed
    // so the service layer can record it without re-reading config.
    string Network { get; }
    string Standard { get; }
    string ContractAddress { get; }

    Task<MintReceipt> MintAsync(MintRequest request, CancellationToken ct);

    // Reads current owner from the contract's ownerOf(tokenId). The verify
    // endpoint uses this to surface the live on-chain holder, which may
    // differ from properties.owner_citizen_id after a transfer.
    Task<string?> OwnerOfAsync(string tokenId, CancellationToken ct);

    // Block-explorer link helpers (UI convenience).
    string ExplorerTxUrl(string txHash);
    string ExplorerTokenUrl(string tokenId);
}

public sealed class MintRequest
{
    public required Guid PropertyId { get; init; }
    public required string OwnerDid { get; init; }
    // Optional EVM address — when null the stub generates one deterministically
    // from the DID; the real impl falls back to the same scheme so the licence
    // stays mintable even before a citizen has registered an on-chain wallet.
    public string? OwnerAddress { get; init; }
    public required string TokenUri { get; init; }
    public required string MetadataSha256 { get; init; }
}

public sealed class MintReceipt
{
    public required string TokenId { get; init; }
    public required string ContractAddress { get; init; }
    public required string Network { get; init; }
    public required string Standard { get; init; }
    public required string OwnerDid { get; init; }
    public required string OwnerAddress { get; init; }
    public required string TxHash { get; init; }
    public long? BlockNumber { get; init; }
    public required DateTimeOffset MintedAt { get; init; }
}

public interface IIpfsService
{
    // Returns the ipfs:// URI under which the JSON is now retrievable.
    Task<IpfsPinResult> PinJsonAsync(string json, CancellationToken ct);

    // Public HTTPS URL the UI can fetch directly without an IPFS client.
    string GatewayUrlFor(string ipfsUri);
}

public sealed class IpfsPinResult
{
    public required string IpfsUri { get; init; }     // ipfs://<cid>
    public required string Cid { get; init; }
    public required string Sha256 { get; init; }
}
