using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sarh.Api.Blockchain;

// The off-chain JSON pinned to IPFS. The on-chain tokenURI resolves to this
// document, and metadata_sha256 anchors it tamper-evidently. Field naming
// follows the de-facto OpenSea / EIP-721 metadata convention so existing
// wallets and explorers render the licence sensibly.
public sealed class PropertyLicenseMetadata
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("description")]
    public required string Description { get; init; }

    [JsonPropertyName("image")]
    public required string Image { get; init; }

    [JsonPropertyName("external_url")]
    public required string ExternalUrl { get; init; }

    [JsonPropertyName("attributes")]
    public required List<MetadataAttribute> Attributes { get; init; }

    // Sarh-specific fields under a namespaced key so EIP-721 conformance
    // isn't broken for marketplaces that ignore unknown top-level keys.
    [JsonPropertyName("sarh")]
    public required SarhExtension Sarh { get; init; }
}

public sealed class MetadataAttribute
{
    [JsonPropertyName("trait_type")]
    public required string TraitType { get; init; }

    [JsonPropertyName("value")]
    public required object Value { get; init; }
}

public sealed class SarhExtension
{
    [JsonPropertyName("property_id")]
    public required Guid PropertyId { get; init; }

    [JsonPropertyName("property_code")]
    public required string PropertyCode { get; init; }

    [JsonPropertyName("owner_did")]
    public required string OwnerDid { get; init; }

    [JsonPropertyName("decree_no")]
    public required string DecreeNo { get; init; }

    [JsonPropertyName("approved_at")]
    public required DateTimeOffset ApprovedAt { get; init; }

    [JsonPropertyName("deed_sha256")]
    public required string DeedSha256 { get; init; }

    // Embedded GeoJSON Polygon (RFC 7946). Real JSON object, not a string —
    // metadata.json on IPFS is then directly consumable by any GIS / NFT
    // viewer that understands GeoJSON. Null when the property has no
    // boundary on file (shouldn't happen for a minted licence, but the
    // schema allows boundary_polygon NULL).
    [JsonPropertyName("polygon_geojson")]
    public JsonElement? PolygonGeoJson { get; init; }

    [JsonPropertyName("verify_url")]
    public required string VerifyUrl { get; init; }
}
