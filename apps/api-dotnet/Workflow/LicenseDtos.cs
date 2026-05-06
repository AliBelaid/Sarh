namespace Sarh.Api.Workflow;

// Body for POST /api/v1/properties/{id}/final-approve.
public sealed class FinalApproveDto
{
    // Optional override of the decree number captured during officer review.
    // When null/blank, the existing properties.approval_decree_no is reused.
    public string? ApprovalDecreeNo { get; init; }

    // Manager-recorded note (kept for audit; not embedded in the NFT metadata).
    public string? Note { get; init; }
}

// Returned by /final-approve. Mirrors the post-mint state the UI's
// 5-pill progress strip in docs/wireframes/06-license-issuance.svg expects.
public sealed class LicenseResult
{
    public required Properties.PropertyView Property { get; init; }
    public required NftView Nft { get; init; }
    public required string ExplorerTxUrl { get; init; }
    public required string ExplorerTokenUrl { get; init; }
    public required string MetadataGatewayUrl { get; init; }
}

public sealed class NftView
{
    public required Guid Id { get; init; }
    public required Guid PropertyId { get; init; }
    public required string TokenId { get; init; }
    public required string ContractAddress { get; init; }
    public required string Network { get; init; }
    public required string Standard { get; init; }
    public required string OwnerDid { get; init; }
    public required string OwnerAddress { get; init; }
    public required string MetadataUri { get; init; }
    public required string MetadataSha256 { get; init; }
    public required string MintTxHash { get; init; }
    public long? MintBlockNumber { get; init; }
    public required Guid MintedByOfficerId { get; init; }
    public required DateTimeOffset MintedAt { get; init; }
    public required string Status { get; init; }

    public static NftView From(Sarh.Api.Data.Entities.PropertyNft n) => new()
    {
        Id = n.Id,
        PropertyId = n.PropertyId,
        TokenId = n.TokenId,
        ContractAddress = n.ContractAddress,
        Network = n.Network,
        Standard = n.Standard,
        OwnerDid = n.OwnerDid,
        OwnerAddress = n.OwnerAddress ?? "",
        MetadataUri = n.MetadataUri,
        MetadataSha256 = n.MetadataSha256,
        MintTxHash = n.MintTxHash,
        MintBlockNumber = n.MintBlockNumber,
        MintedByOfficerId = n.MintedByOfficerId,
        MintedAt = n.MintedAt,
        Status = n.Status,
    };
}
