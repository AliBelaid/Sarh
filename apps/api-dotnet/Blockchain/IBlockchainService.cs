namespace Sarh.Api.Blockchain;

// Thin abstraction over the on-chain operations Sarh needs. Two impls:
//   • StubBlockchainService    — deterministic fake (default in dev)
//   • EthereumBlockchainService — real Nethereum (added when going live)
//
// Both produce the same MintReceipt shape so callers don't branch on mode.
public interface IBlockchainService
{
    // "stub" or "real" — lets the UI/check endpoint label the source of truth.
    string Mode { get; }

    // True when a real on-chain write is possible (contract + key configured).
    // False → mints are simulated (deterministic fakes, not on any real chain).
    bool CanSign { get; }

    // The active network label baked into property_nfts.network. Exposed
    // so the service layer can record it without re-reading config.
    string Network { get; }
    string Standard { get; }
    string ContractAddress { get; }

    // Live RPC health: reachable? chain id, latest block, gas price. Used by
    // the "verify on chain" endpoint. Never throws — failures land in
    // ChainStatus.Error so the UI can show a red banner instead of a 500.
    Task<ChainStatus> GetStatusAsync(CancellationToken ct);

    // Looks up a transaction receipt. Null when the hash is unknown to the
    // node (e.g. a stub-fabricated hash, or a tx not yet mined).
    Task<ChainTxStatus?> GetTxStatusAsync(string txHash, CancellationToken ct);

    Task<MintReceipt> MintAsync(MintRequest request, CancellationToken ct);

    // Transfers an existing token to a new owner DID. Stub mode produces
    // deterministic tx hashes; real impl would call the contract's
    // safeTransferFrom(from, to, tokenId).
    Task<TransferReceipt> TransferAsync(TransferRequest request, CancellationToken ct);

    // Reads current owner from the contract's ownerOf(tokenId). The verify
    // endpoint uses this to surface the live on-chain holder, which may
    // differ from properties.owner_citizen_id after a transfer.
    Task<string?> OwnerOfAsync(string tokenId, CancellationToken ct);

    // Block-explorer link helpers (UI convenience).
    string ExplorerTxUrl(string txHash);
    string ExplorerTokenUrl(string tokenId);

    // A recorded licence is "simulated" when its mint is NOT on the currently
    // configured real contract — i.e. signing is impossible (stub mode), no real
    // contract is configured, or the licence was minted earlier against a
    // different (stub / older) contract. This is a PER-NFT check, so once the
    // system is switched to a real chain the old stub-minted licences are still
    // flagged simulated and the UI keeps hiding their dead explorer links
    // instead of pointing at transactions that never existed on-chain.
    bool IsSimulatedMint(string? mintContractAddress) =>
        !CanSign
        || string.IsNullOrWhiteSpace(ContractAddress)
        || !string.Equals(mintContractAddress, ContractAddress, StringComparison.OrdinalIgnoreCase);
}

// Live snapshot of the configured chain. Connected=false + Error set when
// the RPC is unreachable or the key is invalid.
public sealed class ChainStatus
{
    public required string Mode { get; init; }       // "stub" | "real"
    public required string Network { get; init; }
    public required string Standard { get; init; }
    public required string ContractAddress { get; init; }
    public required bool ContractConfigured { get; init; }
    public required bool CanSign { get; init; }      // mint/transfer possible
    public required bool Connected { get; init; }
    public long? ChainId { get; init; }
    public long? LatestBlock { get; init; }
    public string? GasPriceGwei { get; init; }
    public string? RpcHost { get; init; }            // host only — no api key
    public string? Error { get; init; }
}

public sealed class ChainTxStatus
{
    public required string TxHash { get; init; }
    public required bool Found { get; init; }
    public long? BlockNumber { get; init; }
    public bool? Succeeded { get; init; }            // receipt.status == 1
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

public sealed class TransferRequest
{
    public required string TokenId { get; init; }
    public required string FromDid { get; init; }
    public required string ToDid { get; init; }
    public string? FromAddress { get; init; }
    public string? ToAddress { get; init; }
}

public sealed class TransferReceipt
{
    public required string TokenId { get; init; }
    public required string FromDid { get; init; }
    public required string ToDid { get; init; }
    public required string FromAddress { get; init; }
    public required string ToAddress { get; init; }
    public required string TxHash { get; init; }
    public long? BlockNumber { get; init; }
    public required DateTimeOffset TransferredAt { get; init; }
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
