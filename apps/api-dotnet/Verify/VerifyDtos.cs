using System.Text.Json;

namespace Sarh.Api.Verify;

public sealed class PublicDeedView
{
    public required string PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public required string PropertyType { get; init; }
    public decimal? AreaSqm { get; init; }
    public required string Status { get; init; }
    public string? ApprovalDecreeNo { get; init; }
    public DateTimeOffset? ReviewedAt { get; init; }
    public string? VcCredentialId { get; init; }
    public required string OwnerDisplayName { get; init; }
    public JsonElement? BoundaryPolygonGeojson { get; init; }
    public string? DeedPdfSignedUrl { get; init; }
    public string? DeedSignedHash { get; init; }

    // On-chain NFT licence — present when the property has been minted.
    // Null when the deed exists but no licence has been minted yet (older
    // approvals, or the manager hasn't run final-approve).
    public PublicNftView? Nft { get; init; }

    // Active legal encumbrances (court seizure, mortgage, waqf, …). A
    // verifier MUST see these: a deed can be valid and signed yet the parcel
    // still be unsellable. Empty list = clear title at the registry's record.
    public bool HasActiveDispute { get; init; }
    public IReadOnlyList<PublicDisputeView> ActiveDisputes { get; init; } = [];
}

// Sanitised encumbrance view for the public verify page. No officer ids or
// internal notes — only what a verifier needs to know the parcel is locked.
public sealed class PublicDisputeView
{
    public required string DisputeType { get; init; }
    public required string DisputeTypeAr { get; init; }
    public string? CaseNumber { get; init; }
    public required string IssuingAuthority { get; init; }
    public DateOnly StartDate { get; init; }
}

public sealed class PublicNftView
{
    public required string TokenId { get; init; }
    public required string ContractAddress { get; init; }
    public required string Network { get; init; }
    public required string Standard { get; init; }
    public required string OwnerDid { get; init; }
    public string? OwnerAddress { get; init; }
    public required string MetadataUri { get; init; }
    public required string MetadataGatewayUrl { get; init; }
    public required string MintTxHash { get; init; }
    public required string ExplorerTxUrl { get; init; }
    public required string ExplorerTokenUrl { get; init; }
    public DateTimeOffset MintedAt { get; init; }
    public required string Status { get; init; }
    // True when the live on-chain owner matches the registry's recorded
    // owner_did (i.e. nothing has been transferred out-of-band). False
    // means an off-registry transfer has happened that the registry hasn't
    // ingested yet — UI surfaces this prominently as a warning.
    public bool? OnChainOwnerMatches { get; init; }
    // Live owner address from the contract's ownerOf(tokenId). Null in
    // stub mode (the stub doesn't keep chain state) — UI should treat
    // null as "not reconciled" rather than "mismatched".
    public string? OnChainOwnerAddress { get; init; }
}
