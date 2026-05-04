using System.Text.Json;

namespace Sijilli.Api.Verify;

public sealed class PublicDeedView
{
    public required string PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public required string PropertyType { get; init; }
    public decimal? AreaSqm { get; init; }
    public required string Status { get; init; }
    public string? ApprovalDecreeNo { get; init; }
    public DateTimeOffset? ReviewedAt { get; init; }
    public string? VcCredentialId { get; init; }
    public required string OwnerDisplayName { get; init; }
    public JsonElement? BoundaryPolygonGeojson { get; init; }
    public string? DeedPdfSignedUrl { get; init; }
}
