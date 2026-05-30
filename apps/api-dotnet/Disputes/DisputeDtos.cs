using System.ComponentModel.DataAnnotations;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Disputes;

// Officer records a new encumbrance on a parcel.
public sealed class RecordDisputeDto
{
    [Required] public Guid PropertyId { get; init; }
    [Required] public string DisputeType { get; init; } = "";
    public string? CaseNumber { get; init; }
    [Required] public string IssuingAuthority { get; init; } = "";
    [Required] public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public string? Notes { get; init; }
}

// Officer lifts (releases) an active encumbrance.
public sealed class LiftDisputeDto
{
    // Optional release note appended to the existing notes for the audit trail.
    public string? Notes { get; init; }
}

public sealed class DisputeView
{
    public Guid Id { get; init; }
    public Guid PropertyId { get; init; }
    public string? PropertyCode { get; init; }
    public string DisputeType { get; init; } = "";
    public string DisputeTypeAr { get; init; } = "";
    public string? CaseNumber { get; init; }
    public string IssuingAuthority { get; init; } = "";
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public string Status { get; init; } = "";
    public string StatusAr { get; init; } = "";
    public string? Notes { get; init; }
    public Guid RecordedByOfficerId { get; init; }
    public Guid? LiftedByOfficerId { get; init; }
    public DateTimeOffset? LiftedAt { get; init; }
    public DateTimeOffset CreatedAt { get; init; }

    public static DisputeView From(PropertyDispute d, string? propertyCode) => new()
    {
        Id = d.Id,
        PropertyId = d.PropertyId,
        PropertyCode = propertyCode,
        DisputeType = d.DisputeType,
        DisputeTypeAr = DisputeLabels.TypeAr(d.DisputeType),
        CaseNumber = d.CaseNumber,
        IssuingAuthority = d.IssuingAuthority,
        StartDate = d.StartDate,
        EndDate = d.EndDate,
        Status = d.Status,
        StatusAr = DisputeLabels.StatusAr(d.Status),
        Notes = d.Notes,
        RecordedByOfficerId = d.RecordedByOfficerId,
        LiftedByOfficerId = d.LiftedByOfficerId,
        LiftedAt = d.LiftedAt,
        CreatedAt = d.CreatedAt,
    };
}

// Latin code <-> Arabic display. Codes are the source of truth (DB CHECK);
// Arabic is for UI only.
public static class DisputeLabels
{
    public static readonly IReadOnlyDictionary<string, string> Types = new Dictionary<string, string>
    {
        ["judicial_seizure"]      = "حجز قضائي",
        ["certified_mortgage"]    = "رهن مصدّق",
        ["inheritance_dispute"]   = "نزاع ورثة",
        ["waqf"]                  = "وقف",
        ["precautionary_seizure"] = "حجز تحفظي",
        ["other"]                 = "أخرى",
    };

    public static string TypeAr(string code) => Types.TryGetValue(code, out var ar) ? ar : code;

    public static string StatusAr(string code) => code switch
    {
        "active" => "قائم ومقيد",
        "lifted" => "مرفوع",
        _        => code,
    };
}
