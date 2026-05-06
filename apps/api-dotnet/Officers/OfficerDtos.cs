using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Officers;

public sealed class ListOfficersQuery
{
    public string? Cursor { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 20;
    public string? Q { get; set; }
    public string? Role { get; set; }
    [FromQuery(Name = "region_id")] public int? RegionId { get; set; }
    [FromQuery(Name = "is_active")] public bool? IsActive { get; set; }
}

public sealed class OfficerView
{
    public Guid Id { get; init; }
    public Guid AuthUserId { get; init; }
    public string EmployeeNo { get; init; } = "";
    public string FullNameAr { get; init; } = "";
    public string? FullNameEn { get; init; }
    public string Role { get; init; } = "";
    public int? RegionId { get; init; }
    public int? MunicipalityId { get; init; }
    public string? Phone { get; init; }
    public string? Email { get; init; }
    public bool IsActive { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }

    public static OfficerView From(Officer o) => new()
    {
        Id = o.Id,
        AuthUserId = o.AuthUserId,
        EmployeeNo = o.EmployeeNo,
        FullNameAr = o.FullNameAr,
        FullNameEn = o.FullNameEn,
        Role = o.Role,
        RegionId = o.RegionId,
        MunicipalityId = o.MunicipalityId,
        Phone = o.Phone,
        Email = o.Email,
        IsActive = o.IsActive,
        CreatedAt = o.CreatedAt,
        UpdatedAt = o.UpdatedAt,
    };
}
