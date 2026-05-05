using System.Text.Json.Serialization;

namespace Sarh.Api.Auth;

public sealed class SarhJwtPayload
{
    [JsonPropertyName("sub")] public required string Sub { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("sarh_role")] public required string SarhRole { get; init; }
    [JsonPropertyName("citizen_id")] public string? CitizenId { get; init; }
    [JsonPropertyName("officer_id")] public string? OfficerId { get; init; }
    [JsonPropertyName("region_id")] public int? RegionId { get; init; }
    [JsonPropertyName("municipality_id")] public int? MunicipalityId { get; init; }
    [JsonPropertyName("permissions")] public Dictionary<string, object?>? Permissions { get; init; }
}
