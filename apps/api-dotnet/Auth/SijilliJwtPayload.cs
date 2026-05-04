using System.Text.Json.Serialization;

namespace Sijilli.Api.Auth;

public sealed class SijilliJwtPayload
{
    [JsonPropertyName("sub")] public required string Sub { get; init; }
    [JsonPropertyName("email")] public string? Email { get; init; }
    [JsonPropertyName("sijilli_role")] public required string SijilliRole { get; init; }
    [JsonPropertyName("citizen_id")] public string? CitizenId { get; init; }
    [JsonPropertyName("officer_id")] public string? OfficerId { get; init; }
    [JsonPropertyName("region_id")] public int? RegionId { get; init; }
    [JsonPropertyName("municipality_id")] public int? MunicipalityId { get; init; }
    [JsonPropertyName("permissions")] public Dictionary<string, object?>? Permissions { get; init; }
}
