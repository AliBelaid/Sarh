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

    // Cryptographic deed signature (detached CMS/PKCS#7). Null when no
    // signature is on file (older approvals predating signing).
    public DeedSignatureView? DeedSignature { get; init; }

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

// Public view of the deed's cryptographic signature. Lets a verifier confirm
// the PDF was signed by the Sarh deed authority and hasn't been altered since.
public sealed class DeedSignatureView
{
    // True when the detached CMS verifies against the deed PDF on file.
    public required bool Valid { get; init; }
    public string? SignerSubject { get; init; }
    public string? SignerThumbprint { get; init; }
    public DateTimeOffset? SignedAt { get; init; }
    // Download URL for the detached .p7s signature.
    public required string SignatureUrl { get; init; }
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
    // True when the licence was minted in the standard/simulation flow (no real
    // contract deployed) → the chain artifacts (tx/contract/token) are simulated
    // and not on any real chain. The public verify page then hides the dead
    // block-explorer link instead of 404-ing the verifier to Etherscan.
    public bool Simulated { get; init; }
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
