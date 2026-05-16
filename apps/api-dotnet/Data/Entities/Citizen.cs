using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

[Table("citizens")]
public class Citizen
{
    [Column("id")] public Guid Id { get; set; }

    [Column("first_name_ar")] public string FirstNameAr { get; set; } = "";
    [Column("father_name_ar")] public string FatherNameAr { get; set; } = "";
    [Column("grandfather_name_ar")] public string GrandfatherNameAr { get; set; } = "";
    [Column("family_name_ar")] public string FamilyNameAr { get; set; } = "";

    [Column("full_name_ar")] public string FullNameAr { get; set; } = "";

    [Column("first_name_en")] public string? FirstNameEn { get; set; }
    [Column("father_name_en")] public string? FatherNameEn { get; set; }
    [Column("grandfather_name_en")] public string? GrandfatherNameEn { get; set; }
    [Column("family_name_en")] public string? FamilyNameEn { get; set; }

    [Column("mother_name_ar")] public string? MotherNameAr { get; set; }
    [Column("legacy_national_no")] public string? LegacyNationalNo { get; set; }
    [Column("family_book_no")] public string? FamilyBookNo { get; set; }

    [Column("gender")] public string Gender { get; set; } = "";
    [Column("birth_date")] public DateTime BirthDate { get; set; }
    [Column("birth_place")] public string? BirthPlace { get; set; }
    [Column("nationality")] public string? Nationality { get; set; }
    [Column("marital_status")] public string? MaritalStatus { get; set; }

    [Column("phone")] public string? Phone { get; set; }
    [Column("email")] public string? Email { get; set; }

    [Column("region_id")] public int? RegionId { get; set; }
    [Column("municipality_id")] public int? MunicipalityId { get; set; }
    [Column("address_ar")] public string? AddressAr { get; set; }

    [Column("photo_path")] public string? PhotoPath { get; set; }
    [Column("signature_path")] public string? SignaturePath { get; set; }

    [Column("created_by")] public Guid? CreatedBy { get; set; }
    [Column("auth_user_id")] public Guid? AuthUserId { get; set; }
    [Column("is_active")] public bool IsActive { get; set; }

    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}
