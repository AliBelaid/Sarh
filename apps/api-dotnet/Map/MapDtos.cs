using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sarh.Api.Map;

// GeoJSON FeatureCollection of parcels for the map surfaces. Shaped as
// standard GeoJSON so Leaflet (web) / mapbox (mobile) can consume it directly:
//   { "type":"FeatureCollection", "features":[ { "type":"Feature",
//       "geometry": <Polygon>, "properties": { … } }, … ] }
public sealed class MapFeatureCollection
{
    public string Type => "FeatureCollection";
    public required IReadOnlyList<MapFeature> Features { get; init; }
}

public sealed class MapFeature
{
    public string Type => "Feature";
    // The parcel boundary as a GeoJSON Polygon. Already in [lng,lat] order.
    public JsonElement? Geometry { get; init; }
    public required MapFeatureProps Properties { get; init; }
}

// Strictly PUBLIC attributes — never an owner name, national number, or any
// citizen id. Identical shape on the public + officer feeds; the officer feed
// merely includes parcels still in the workflow (pending/frozen).
public sealed class MapFeatureProps
{
    public Guid Id { get; init; }
    public string? PropertyCode { get; init; }
    public string? ParcelNumber { get; init; }
    public string PropertyType { get; init; } = "";
    // Raw workflow status (approved/pending/…).
    public string Status { get; init; } = "";
    // Derived colour bucket: clear | disputed | pending | public.
    public string MapStatus { get; init; } = "";
    public int? RegionId { get; init; }
    public decimal? AreaSqm { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public bool HasActiveDispute { get; init; }
    // True when this parcel's polygon overlaps another live parcel by a real
    // area (possible double-registration). Derived in property_map_features (045);
    // independent of MapStatus so the client can paint a distinct conflict outline.
    public bool HasLocationConflict { get; init; }
    // Marker anchor (centroid). Handy for label/pin placement without the
    // client re-deriving it from the polygon ring.
    public double Lng { get; init; }
    public double Lat { get; init; }
}
