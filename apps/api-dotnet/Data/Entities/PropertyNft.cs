using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("property_nfts")]
public class PropertyNft
{
    [Column("id")] public Guid Id { get; set; }
    [Column("property_id")] public Guid PropertyId { get; set; }
    [Column("token_id")] public string TokenId { get; set; } = "";
    [Column("contract_address")] public string ContractAddress { get; set; } = "";
    [Column("network")] public string Network { get; set; } = "";
    [Column("standard")] public string Standard { get; set; } = "ERC-721";
    [Column("owner_did")] public string OwnerDid { get; set; } = "";
    [Column("owner_address")] public string? OwnerAddress { get; set; }
    [Column("metadata_uri")] public string MetadataUri { get; set; } = "";
    [Column("metadata_sha256")] public string MetadataSha256 { get; set; } = "";
    [Column("mint_tx_hash")] public string MintTxHash { get; set; } = "";
    [Column("mint_block_number")] public long? MintBlockNumber { get; set; }
    [Column("minted_by_officer_id")] public Guid MintedByOfficerId { get; set; }
    [Column("minted_at")] public DateTimeOffset MintedAt { get; set; }
    [Column("status")] public string Status { get; set; } = "pending";
    [Column("last_reconciled_at")] public DateTimeOffset? LastReconciledAt { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("ownership_history")]
public class OwnershipHistory
{
    [Column("id")] public Guid Id { get; set; }
    [Column("property_id")] public Guid PropertyId { get; set; }
    [Column("nft_id")] public Guid? NftId { get; set; }
    [Column("from_did")] public string? FromDid { get; set; }
    [Column("to_did")] public string ToDid { get; set; } = "";
    [Column("from_citizen_id")] public Guid? FromCitizenId { get; set; }
    [Column("to_citizen_id")] public Guid ToCitizenId { get; set; }
    [Column("transfer_tx_hash")] public string? TransferTxHash { get; set; }
    [Column("transfer_block_number")] public long? TransferBlockNumber { get; set; }
    [Column("reason")] public string Reason { get; set; } = "initial_mint";
    [Column("notes_ar")] public string? NotesAr { get; set; }
    [Column("recorded_by_officer_id")] public Guid? RecordedByOfficerId { get; set; }
    [Column("transferred_at")] public DateTimeOffset TransferredAt { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
}
