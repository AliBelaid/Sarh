using System.ComponentModel.DataAnnotations;
using Sijilli.Api.Common;
using Sijilli.Api.Data.Entities;

namespace Sijilli.Api.Citizens;

public sealed class CreateCitizenDto
{
    [Required, MinLength(2), MaxLength(64)] public string FirstNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string FatherNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string GrandfatherNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string FamilyNameAr { get; set; } = "";

    [MaxLength(64)] public string? FirstNameEn { get; set; }
    [MaxLength(64)] public string? FatherNameEn { get; set; }
    [MaxLength(64)] public string? GrandfatherNameEn { get; set; }
    [MaxLength(64)] public string? FamilyNameEn { get; set; }

    [MaxLength(192)] public string? MotherNameAr { get; set; }
    [MaxLength(20)] public string? LegacyNationalNo { get; set; }
    [MaxLength(20)] public string? FamilyBookNo { get; set; }

    [Required, RegularExpression("^(male|female)$")] public string Gender { get; set; } = "";
    [Required] public DateOnly BirthDate { get; set; }
    [MaxLength(96)] public string? BirthPlace { get; set; }
    [RegularExpression("^(single|married|divorced|widowed)$")] public string? MaritalStatus { get; set; }

    [RegularExpression(@"^\+?[0-9]{8,15}$")] public string? Phone { get; set; }
    [EmailAddress] public string? Email { get; set; }

    [Required] public int RegionId { get; set; }
    public int? MunicipalityId { get; set; }
    public string? AddressAr { get; set; }
    public string? PhotoPath { get; set; }
    public string? SignaturePath { get; set; }
}

/// <summary>Patch payload — null means "leave unchanged" because we cannot
/// distinguish "explicit null" from "absent" with System.Text.Json.</summary>
public sealed class UpdateCitizenDto
{
    [MaxLength(64)] public string? FirstNameEn { get; set; }
    [MaxLength(64)] public string? FatherNameEn { get; set; }
    [MaxLength(64)] public string? GrandfatherNameEn { get; set; }
    [MaxLength(64)] public string? FamilyNameEn { get; set; }
    [MaxLength(192)] public string? MotherNameAr { get; set; }
    [MaxLength(20)] public string? LegacyNationalNo { get; set; }
    [MaxLength(20)] public string? FamilyBookNo { get; set; }

    [MaxLength(96)] public string? BirthPlace { get; set; }
    [RegularExpression("^(single|married|divorced|widowed)$")] public string? MaritalStatus { get; set; }

    [RegularExpression(@"^\+?[0-9]{8,15}$")] public string? Phone { get; set; }
    [EmailAddress] public string? Email { get; set; }

    public int? RegionId { get; set; }
    public int? MunicipalityId { get; set; }
    public string? AddressAr { get; set; }
    public string? PhotoPath { get; set; }
    public string? SignaturePath { get; set; }
}

public sealed class ListCitizensQuery
{
    public string? Cursor { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 20;
    public string? Q { get; set; }
    [Microsoft.AspNetCore.Mvc.FromQuery(Name = "region_id")]
    public int? RegionId { get; set; }
}

public sealed class CitizenView
{
    public Guid Id { get; init; }
    public string FirstNameAr { get; init; } = "";
    public string FatherNameAr { get; init; } = "";
    public string GrandfatherNameAr { get; init; } = "";
    public string FamilyNameAr { get; init; } = "";
    public string? FirstNameEn { get; init; }
    public string? FatherNameEn { get; init; }
    public string? GrandfatherNameEn { get; init; }
    public string? FamilyNameEn { get; init; }
    public string? MotherNameAr { get; init; }
    public string? LegacyNationalNo { get; init; }
    public string? FamilyBookNo { get; init; }
    public string Gender { get; init; } = "";
    public DateTime BirthDate { get; init; }
    public string? BirthPlace { get; init; }
    public string? Nationality { get; init; }
    public string? MaritalStatus { get; init; }
    public string? Phone { get; init; }
    public string? Email { get; init; }
    public int? RegionId { get; init; }
    public int? MunicipalityId { get; init; }
    public string? AddressAr { get; init; }
    public string? PhotoPath { get; init; }
    public string? SignaturePath { get; init; }
    public bool IsActive { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }

    public static CitizenView From(Citizen c) => new()
    {
        Id = c.Id,
        FirstNameAr = c.FirstNameAr,
        FatherNameAr = c.FatherNameAr,
        GrandfatherNameAr = c.GrandfatherNameAr,
        FamilyNameAr = c.FamilyNameAr,
        FirstNameEn = c.FirstNameEn,
        FatherNameEn = c.FatherNameEn,
        GrandfatherNameEn = c.GrandfatherNameEn,
        FamilyNameEn = c.FamilyNameEn,
        MotherNameAr = c.MotherNameAr,
        LegacyNationalNo = c.LegacyNationalNo,
        FamilyBookNo = c.FamilyBookNo,
        Gender = c.Gender,
        BirthDate = c.BirthDate,
        BirthPlace = c.BirthPlace,
        Nationality = c.Nationality,
        MaritalStatus = c.MaritalStatus,
        Phone = c.Phone,
        Email = c.Email,
        RegionId = c.RegionId,
        MunicipalityId = c.MunicipalityId,
        AddressAr = c.AddressAr,
        PhotoPath = c.PhotoPath,
        SignaturePath = c.SignaturePath,
        IsActive = c.IsActive,
        CreatedAt = c.CreatedAt,
        UpdatedAt = c.UpdatedAt,
    };
}

