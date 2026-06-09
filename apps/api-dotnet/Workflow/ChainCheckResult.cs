namespace Sarh.Api.Workflow;

// The "verify on chain" payload for a single NFT licence. Combines a live RPC
// health snapshot with token-level reads (ownerOf + mint-tx receipt) so the
// UI can show, in one panel, whether the recorded chain artifacts actually
// exist on the live network. Serialized snake_case by the global policy.
public sealed class ChainCheckResult
{
    // ── Network / RPC ──
    public required string Mode { get; init; }              // "real" | "stub"
    public required string Network { get; init; }
    public required string Standard { get; init; }
    public long? ChainId { get; init; }
    public required bool RpcConnected { get; init; }
    public string? RpcHost { get; init; }
    public string? RpcError { get; init; }
    public long? LatestBlock { get; init; }
    public string? GasPriceGwei { get; init; }

    // ── Contract ──
    public required string ContractAddress { get; init; }
    public required bool ContractConfigured { get; init; }
    public required bool CanSign { get; init; }

    // ── This token ──
    public required string TokenId { get; init; }
    public required string RecordedOwnerAddress { get; init; }
    public string? OnChainOwner { get; init; }
    public bool? TokenExistsOnChain { get; init; }
    public bool? OwnerMatches { get; init; }

    // ── Mint transaction ──
    public required string MintTxHash { get; init; }
    public bool? TxFound { get; init; }
    public long? TxBlockNumber { get; init; }
    public bool? TxSucceeded { get; init; }

    public required string ExplorerTxUrl { get; init; }
    public required string ExplorerTokenUrl { get; init; }
    public required string MetadataUri { get; init; }
    public required DateTimeOffset CheckedAt { get; init; }
}
