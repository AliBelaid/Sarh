using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("properties")]
public class Property
{
    [Column("id")] public Guid Id { get; set; }
    [Column("property_code")] public string? PropertyCode { get; set; }
    [Column("parcel_number")] public string? ParcelNumber { get; set; }
    [Column("plan_number")] public string? PlanNumber { get; set; }
    [Column("block_number")] public string? BlockNumber { get; set; }
    [Column("owner_citizen_id")] public Guid OwnerCitizenId { get; set; }
    [Column("property_type")] public string PropertyType { get; set; } = "";
    [Column("region_id")] public int? RegionId { get; set; }
    [Column("municipality_id")] public int? MunicipalityId { get; set; }
    [Column("address_ar")] public string? AddressAr { get; set; }
    [Column("area_sqm")] public decimal? AreaSqm { get; set; }
    [Column("length_m")] public decimal? LengthM { get; set; }
    [Column("width_m")] public decimal? WidthM { get; set; }
    [Column("depth_m")] public decimal? DepthM { get; set; }
    [Column("status")] public string Status { get; set; } = "draft";
    [Column("submitted_at")] public DateTimeOffset? SubmittedAt { get; set; }
    [Column("reviewed_at")] public DateTimeOffset? ReviewedAt { get; set; }
    [Column("reviewed_by_officer_id")] public Guid? ReviewedByOfficerId { get; set; }
    [Column("rejection_reason")] public string? RejectionReason { get; set; }
    [Column("approval_decree_no")] public string? ApprovalDecreeNo { get; set; }
    [Column("deed_pdf_path")] public string? DeedPdfPath { get; set; }
    [Column("deed_signed_hash")] public string? DeedSignedHash { get; set; }
    [Column("vc_credential_id")] public string? VcCredentialId { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}

[Table("regions")]
public class Region
{
    [Column("id")] public int Id { get; set; }
    [Column("code")] public string Code { get; set; } = "";
    [Column("name_ar")] public string NameAr { get; set; } = "";
    [Column("name_en")] public string? NameEn { get; set; }
}
