using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Properties;

public sealed class CreatePropertyDto
{
    [Required, RegularExpression("^(residential|agricultural|commercial|governmental|industrial|mixed)$")]
    public string PropertyType { get; set; } = "";
    [Required] public int RegionId { get; set; }
    public int? MunicipalityId { get; set; }
    public string? AddressAr { get; set; }
    [MaxLength(32)] public string? ParcelNumber { get; set; }
    [MaxLength(32)] public string? PlanNumber { get; set; }
    [MaxLength(32)] public string? BlockNumber { get; set; }

    [Required] public JsonElement BoundaryPolygon { get; set; }

    [Required, Range(0.01, double.MaxValue)] public decimal AreaSqm { get; set; }
    public decimal? LengthM { get; set; }
    public decimal? WidthM { get; set; }
    public decimal? DepthM { get; set; }
}

public sealed class ListPropertiesQuery
{
    public string? Cursor { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 20;
    // Mirror of ck_properties_status in 028_property_nfts_ownership_history.sql.
    [RegularExpression("^(draft|pending|under_review|approved|rejected|needs_clarification|frozen|minted|transferred)$")]
    public string? Status { get; set; }
    [Microsoft.AspNetCore.Mvc.FromQuery(Name = "region_id")]
    public int? RegionId { get; set; }
}

public sealed class OverlapCheckDto
{
    [Required] public JsonElement Polygon { get; set; }
}

public sealed class NearbyQuery
{
    [Required, Range(-180, 180)] public double Lng { get; set; }
    [Required, Range(-90, 90)] public double Lat { get; set; }
    [Required, Range(1, 50000)]
    [Microsoft.AspNetCore.Mvc.FromQuery(Name = "radius_m")]
    public double RadiusM { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 20;
}

public sealed class ReviewDecisionDto
{
    [Required, RegularExpression("^(approve|reject|needs_clarification)$")]
    public string Decision { get; set; } = "";
    public string? Note { get; set; }
    public string? ApprovalDecreeNo { get; set; }
}

public sealed class PropertyView
{
    public Guid Id { get; init; }
    public string? PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public string? PlanNumber { get; init; }
    public string? BlockNumber { get; init; }
    public Guid OwnerCitizenId { get; init; }
    public string PropertyType { get; init; } = "";
    public int? RegionId { get; init; }
    public int? MunicipalityId { get; init; }
    public string? AddressAr { get; init; }
    public decimal? AreaSqm { get; init; }
    public decimal? LengthM { get; init; }
    public decimal? WidthM { get; init; }
    public decimal? DepthM { get; init; }
    public string Status { get; init; } = "";
    public DateTimeOffset? SubmittedAt { get; init; }
    public DateTimeOffset? ReviewedAt { get; init; }
    public Guid? ReviewedByOfficerId { get; init; }
    public string? RejectionReason { get; init; }
    public string? ApprovalDecreeNo { get; init; }
    public string? DeedPdfPath { get; init; }
    public string? DeedSignedHash { get; init; }
    public string? VcCredentialId { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }

    public static PropertyView From(Property p) => new()
    {
        Id = p.Id,
        PropertyCode = p.PropertyCode,
        ParcelNumber = p.ParcelNumber,
        PlanNumber = p.PlanNumber,
        BlockNumber = p.BlockNumber,
        OwnerCitizenId = p.OwnerCitizenId,
        PropertyType = p.PropertyType,
        RegionId = p.RegionId,
        MunicipalityId = p.MunicipalityId,
        AddressAr = p.AddressAr,
        AreaSqm = p.AreaSqm,
        LengthM = p.LengthM,
        WidthM = p.WidthM,
        DepthM = p.DepthM,
        Status = p.Status,
        SubmittedAt = p.SubmittedAt,
        ReviewedAt = p.ReviewedAt,
        ReviewedByOfficerId = p.ReviewedByOfficerId,
        RejectionReason = p.RejectionReason,
        ApprovalDecreeNo = p.ApprovalDecreeNo,
        DeedPdfPath = p.DeedPdfPath,
        DeedSignedHash = p.DeedSignedHash,
        VcCredentialId = p.VcCredentialId,
        CreatedAt = p.CreatedAt,
        UpdatedAt = p.UpdatedAt,
    };
}

public sealed class SubmitResult
{
    public required PropertyView Property { get; init; }
    public required RegistrationRequestView RegistrationRequest { get; init; }
    public required ValidationResult Validation { get; init; }
}

public sealed class RegistrationRequestView
{
    public Guid Id { get; init; }
    public required string RequestNo { get; init; }
    public Guid PropertyId { get; init; }
    public required string CurrentStatus { get; init; }
    public DateTimeOffset SubmittedAt { get; init; }
}

public sealed class ValidationResult
{
    public decimal ComputedAreaSqm { get; init; }
    public decimal? AreaDiffPct { get; init; }
}

public sealed class NearbyResult
{
    public required IReadOnlyList<PropertyNearby> Items { get; init; }
}

public sealed class OverlapResult
{
    public required IReadOnlyList<PropertyOverlap> Overlaps { get; init; }
}

public sealed class PropertyOverlap
{
    public Guid PropertyId { get; init; }
    public string? PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public decimal? OverlapPct { get; init; }
}

public sealed class PropertyNearby
{
    public Guid Id { get; init; }
    public string? PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public string? PropertyType { get; init; }
    public string? Status { get; init; }
    public decimal? AreaSqm { get; init; }
    public decimal? DistanceM { get; init; }
}

public sealed class ReviewResult
{
    public required PropertyView Property { get; init; }
    public ReviewDeed? Deed { get; init; }
    public ReviewVc? Vc { get; init; }
}

public sealed class ReviewDeed
{
    public required string Path { get; init; }
    public required string Sha256 { get; init; }
    public required string VerifyUrl { get; init; }
}

public sealed class ReviewVc
{
    public required string CredentialId { get; init; }
    public required string Did { get; init; }
    public bool IsPlaceholder { get; init; }
}
