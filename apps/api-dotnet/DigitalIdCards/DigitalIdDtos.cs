using System.ComponentModel.DataAnnotations;
using Sijilli.Api.Data.Entities;

namespace Sijilli.Api.DigitalIdCards;

public sealed class IssueCardDto
{
    [Required] public Guid CitizenId { get; set; }
    [Required] public string RegionCode { get; set; } = "";
    [Range(2024, 2100)] public int? Year { get; set; }
    [Range(1, 20)] public int? ValidityYears { get; set; }
    public string? PhotoBucket { get; set; }
    public string? PhotoPath { get; set; }
    public string? PhotoSha256 { get; set; }
}

public sealed class FreezeCardDto
{
    [Required, MaxLength(500)] public string Reason { get; set; } = "";
}

public sealed class RevokeCardDto
{
    [Required, MaxLength(500)] public string Reason { get; set; } = "";
}

public sealed class ReissueCardDto
{
    [Required, MaxLength(500)] public string Reason { get; set; } = "";
    public bool? KeepDigitalIdNumber { get; set; }
}

public sealed class ListCardsQuery
{
    public string? Cursor { get; set; }
    [Range(1, 200)] public int Limit { get; set; } = 50;
    [RegularExpression("^(active|frozen|revoked)$")]
    public string? Status { get; set; }
    public string? Q { get; set; }
}

public sealed class CardCitizenSummary
{
    public Guid Id { get; init; }
    public string FirstNameAr { get; init; } = "";
    public string FatherNameAr { get; init; } = "";
    public string FamilyNameAr { get; init; } = "";
    public int? RegionId { get; init; }
    public string? Phone { get; init; }
}

public sealed class CardView
{
    public Guid Id { get; init; }
    public Guid CitizenId { get; init; }
    public string DigitalIdNumber { get; init; } = "";
    public string CardSerial { get; init; } = "";
    public string? NfcUid { get; init; }
    public string? NfcSignatureKeyId { get; init; }
    public string? Did { get; init; }
    public string? DidDoc { get; init; }
    public string? WalletEndpoint { get; init; }
    public DateTimeOffset IssuedAt { get; init; }
    public Guid? IssuedByOfficerId { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
    public string Status { get; init; } = "";
    public DateTimeOffset? RevokedAt { get; init; }
    public string? RevokedReason { get; init; }
    public string? PhotoHash { get; init; }
    public string? DataHash { get; init; }
    public long LastNfcCounter { get; init; }
    public DateTimeOffset? LastNfcTapAt { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public CardCitizenSummary? Citizen { get; init; }

    public static CardView From(DigitalIdCard c, CardCitizenSummary? citizen = null) => new()
    {
        Id = c.Id,
        CitizenId = c.CitizenId,
        DigitalIdNumber = c.DigitalIdNumber,
        CardSerial = c.CardSerial,
        NfcUid = c.NfcUid,
        NfcSignatureKeyId = c.NfcSignatureKeyId,
        Did = c.Did,
        DidDoc = c.DidDoc,
        WalletEndpoint = c.WalletEndpoint,
        IssuedAt = c.IssuedAt,
        IssuedByOfficerId = c.IssuedByOfficerId,
        ExpiresAt = c.ExpiresAt,
        Status = c.Status,
        RevokedAt = c.RevokedAt,
        RevokedReason = c.RevokedReason,
        PhotoHash = c.PhotoHash,
        DataHash = c.DataHash,
        LastNfcCounter = c.LastNfcCounter,
        LastNfcTapAt = c.LastNfcTapAt,
        CreatedAt = c.CreatedAt,
        UpdatedAt = c.UpdatedAt,
        Citizen = citizen,
    };
}

public sealed class IssueCardResult
{
    public required CardView Card { get; init; }
    public required IssueCardNfcKeys NfcKeys { get; init; }
    public required string SunUrlTemplate { get; init; }
}

public sealed class IssueCardNfcKeys
{
    public required string MetaReadKeyHex { get; init; }
    public required string SdmFileReadKeyHex { get; init; }
    public required string KmsKeyId { get; init; }
}
