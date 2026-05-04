using System.ComponentModel.DataAnnotations;

namespace Sijilli.Api.Nfc;

public sealed class EncodeCardDto
{
    [Required] public Guid CardId { get; set; }
    [Required, RegularExpression("^[0-9a-fA-F]{14}$")]
    public string NfcUid { get; set; } = "";
}

public sealed class EncodeCardResult
{
    public bool Ok { get; init; } = true;
    public required EncodedCardSummary Card { get; init; }
}

public sealed class EncodedCardSummary
{
    public Guid Id { get; init; }
    public Guid CitizenId { get; init; }
    public string? NfcUid { get; init; }
    public string Status { get; init; } = "";
}

public sealed class VerifySunDto
{
    public string? Url { get; set; }
    public string? P { get; set; }
    public string? C { get; set; }
}

public sealed class VerifySunResult
{
    public Guid CardId { get; init; }
    public string DigitalIdNumber { get; init; } = "";
    public string Status { get; init; } = "";
    public int Counter { get; init; }
    public required VerifySunCitizen Citizen { get; init; }
}

public sealed class VerifySunCitizen
{
    public Guid Id { get; init; }
    public string FullNameAr { get; init; } = "";
    public string? PhotoPath { get; init; }
    public int? RegionId { get; init; }
}
