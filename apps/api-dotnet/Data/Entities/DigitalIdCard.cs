using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("digital_id_cards")]
public class DigitalIdCard
{
    [Column("id")] public Guid Id { get; set; }
    [Column("citizen_id")] public Guid CitizenId { get; set; }
    [Column("digital_id_number")] public string DigitalIdNumber { get; set; } = "";
    [Column("card_serial")] public string CardSerial { get; set; } = "";
    [Column("nfc_uid")] public string? NfcUid { get; set; }
    [Column("nfc_signature_key_id")] public string? NfcSignatureKeyId { get; set; }
    [Column("last_nfc_counter")] public long LastNfcCounter { get; set; }
    [Column("last_nfc_tap_at")] public DateTimeOffset? LastNfcTapAt { get; set; }
    [Column("did")] public string? Did { get; set; }
    [Column("did_doc")] public string? DidDoc { get; set; }
    [Column("wallet_endpoint")] public string? WalletEndpoint { get; set; }
    [Column("issued_at")] public DateTimeOffset IssuedAt { get; set; }
    [Column("issued_by_officer_id")] public Guid? IssuedByOfficerId { get; set; }
    [Column("expires_at")] public DateTimeOffset ExpiresAt { get; set; }
    [Column("status")] public string Status { get; set; } = "active";
    [Column("revoked_at")] public DateTimeOffset? RevokedAt { get; set; }
    [Column("revoked_reason")] public string? RevokedReason { get; set; }
    [Column("photo_hash")] public string? PhotoHash { get; set; }
    [Column("data_hash")] public string? DataHash { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("id_issuance_history")]
public class IdIssuanceHistory
{
    [Column("id")] public Guid Id { get; set; }
    [Column("citizen_id")] public Guid CitizenId { get; set; }
    [Column("card_id")] public Guid? CardId { get; set; }
    [Column("action")] public string Action { get; set; } = "";
    [Column("reason")] public string? Reason { get; set; }
    [Column("officer_id")] public Guid? OfficerId { get; set; }
    [Column("occurred_at")] public DateTimeOffset OccurredAt { get; set; }
}

[Table("nfc_card_secrets")]
public class NfcCardSecret
{
    [Column("id")] public Guid Id { get; set; }
    [Column("card_id")] public Guid CardId { get; set; }
    [Column("meta_read_key_enc")] public byte[] MetaReadKeyEnc { get; set; } = Array.Empty<byte>();
    [Column("meta_read_key_iv")] public byte[] MetaReadKeyIv { get; set; } = Array.Empty<byte>();
    [Column("sdm_file_read_key_enc")] public byte[] SdmFileReadKeyEnc { get; set; } = Array.Empty<byte>();
    [Column("sdm_file_read_key_iv")] public byte[] SdmFileReadKeyIv { get; set; } = Array.Empty<byte>();
    [Column("kms_key_id")] public string KmsKeyId { get; set; } = "";
    [Column("wrap_alg")] public string WrapAlg { get; set; } = "AES-256-GCM";
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("rotated_at")] public DateTimeOffset? RotatedAt { get; set; }
}
