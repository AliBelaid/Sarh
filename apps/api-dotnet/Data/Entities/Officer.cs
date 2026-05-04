using System.ComponentModel.DataAnnotations.Schema;

namespace Sijilli.Api.Data.Entities;

[Table("officers")]
public class Officer
{
    [Column("id")] public Guid Id { get; set; }
    [Column("auth_user_id")] public Guid AuthUserId { get; set; }
    [Column("employee_no")] public string EmployeeNo { get; set; } = "";
    [Column("full_name_ar")] public string FullNameAr { get; set; } = "";
    [Column("full_name_en")] public string? FullNameEn { get; set; }
    [Column("role")] public string Role { get; set; } = "";
    [Column("region_id")] public int? RegionId { get; set; }
    [Column("municipality_id")] public int? MunicipalityId { get; set; }
    [Column("phone")] public string? Phone { get; set; }
    [Column("email")] public string? Email { get; set; }
    [Column("permissions")] public string? Permissions { get; set; }
    [Column("is_active")] public bool IsActive { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}
