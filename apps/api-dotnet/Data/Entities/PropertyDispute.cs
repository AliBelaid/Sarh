using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

// A legal encumbrance on a parcel: court seizure, certified mortgage,
// inheritance dispute, waqf, precautionary seizure. An 'active' row blocks
// both the sale (TransferService) and mint (LicenseService) paths until it
// is lifted. See migration 041_property_disputes.sql.
[Table("property_disputes")]
public class PropertyDispute
{
    [Column("id")] public Guid Id { get; set; }
    [Column("property_id")] public Guid PropertyId { get; set; }
    [Column("dispute_type")] public string DisputeType { get; set; } = "";
    [Column("case_number")] public string? CaseNumber { get; set; }
    [Column("issuing_authority")] public string IssuingAuthority { get; set; } = "";
    [Column("start_date")] public DateOnly StartDate { get; set; }
    [Column("end_date")] public DateOnly? EndDate { get; set; }
    [Column("status")] public string Status { get; set; } = "active";
    [Column("notes")] public string? Notes { get; set; }
    [Column("recorded_by_officer_id")] public Guid RecordedByOfficerId { get; set; }
    [Column("lifted_by_officer_id")] public Guid? LiftedByOfficerId { get; set; }
    [Column("lifted_at")] public DateTimeOffset? LiftedAt { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}

// Registry branch / ID-issuance office. INT-keyed lookup (offices, 040).
[Table("offices")]
public class Office
{
    [Column("id")] public int Id { get; set; }
    [Column("code")] public string Code { get; set; } = "";
    [Column("name_ar")] public string NameAr { get; set; } = "";
    [Column("name_en")] public string? NameEn { get; set; }
    [Column("office_type")] public string OfficeType { get; set; } = "registry";
    [Column("region_id")] public int? RegionId { get; set; }
    [Column("municipality_id")] public int? MunicipalityId { get; set; }
    [Column("address_ar")] public string? AddressAr { get; set; }
    [Column("phone")] public string? Phone { get; set; }
    [Column("is_active")] public bool IsActive { get; set; } = true;
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}
