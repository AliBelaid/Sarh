using System.Text;
using System.Text.Json;
using Sijilli.Api.Common.Errors;

namespace Sijilli.Api.Properties;

/// <summary>
/// Light validation + GeoJSON Polygon → SQL-Server WKT conversion.
/// Mirrors apps/api/src/properties/utils/geojson.ts. We only handle the
/// shape Sijilli emits: { "type":"Polygon", "coordinates": [ [ [lng,lat], … ] ] }.
/// </summary>
public static class GeoJsonPolygon
{
    private const double LIBYA_LNG_MIN = 9.0,  LIBYA_LNG_MAX = 26.0;
    private const double LIBYA_LAT_MIN = 19.0, LIBYA_LAT_MAX = 34.0;
    private const int MIN_RING_POINTS = 4;

    public static (string Wkt, string GeoJson) ValidateAndConvert(JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object)
            throw SijilliException.Validation(
                "حقل boundary_polygon يجب أن يكون GeoJSON Polygon.",
                "boundary_polygon must be a GeoJSON Polygon object.");

        if (!input.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String ||
            typeEl.GetString() != "Polygon")
            throw SijilliException.Validation(
                "نوع GeoJSON يجب أن يكون Polygon.",
                "GeoJSON type must be 'Polygon'.");

        if (!input.TryGetProperty("coordinates", out var coords) || coords.ValueKind != JsonValueKind.Array)
            throw SijilliException.Validation(
                "إحداثيات GeoJSON غير صالحة.",
                "Invalid GeoJSON coordinates.");

        if (coords.GetArrayLength() < 1)
            throw SijilliException.Validation(
                "GeoJSON Polygon يحتاج إلى حلقة خارجية واحدة على الأقل.",
                "GeoJSON Polygon must have at least one ring.");

        var ring = coords[0];
        if (ring.ValueKind != JsonValueKind.Array || ring.GetArrayLength() < MIN_RING_POINTS)
            throw SijilliException.Validation(
                $"الحلقة الخارجية تحتاج إلى {MIN_RING_POINTS} نقاط على الأقل.",
                $"Outer ring must have at least {MIN_RING_POINTS} points.");

        var points = new List<(double Lng, double Lat)>();
        foreach (var pt in ring.EnumerateArray())
        {
            if (pt.ValueKind != JsonValueKind.Array || pt.GetArrayLength() < 2)
                throw SijilliException.Validation(
                    "كل نقطة يجب أن تكون [lng, lat].",
                    "Each point must be [lng, lat].");
            var lng = pt[0].GetDouble();
            var lat = pt[1].GetDouble();
            if (double.IsNaN(lng) || double.IsNaN(lat) || double.IsInfinity(lng) || double.IsInfinity(lat))
                throw SijilliException.Validation(
                    "إحداثية غير صالحة (NaN/Infinity).",
                    "Coordinate is NaN or Infinity.");
            if (lng < LIBYA_LNG_MIN || lng > LIBYA_LNG_MAX || lat < LIBYA_LAT_MIN || lat > LIBYA_LAT_MAX)
                throw SijilliException.Validation(
                    $"الإحداثية ({lng}, {lat}) خارج حدود ليبيا التقريبيّة.",
                    $"Coordinate ({lng}, {lat}) is outside Libya's bounding box.");
            points.Add((lng, lat));
        }

        var first = points[0];
        var last = points[^1];
        if (Math.Abs(first.Lng - last.Lng) > 1e-9 || Math.Abs(first.Lat - last.Lat) > 1e-9)
            throw SijilliException.Validation(
                "الحلقة الخارجية يجب أن تكون مغلقة (النقطة الأولى = الأخيرة).",
                "Outer ring must be closed (first point equals last).");

        // SQL Server geography expects ring orientation = counter-clockwise
        // for the **outer** ring (PostGIS is the opposite, but we emit WKT
        // in CCW order for STGeomFromText). Compute signed area to detect.
        var signed = 0.0;
        for (var i = 0; i < points.Count - 1; i++)
        {
            var a = points[i]; var b = points[i + 1];
            signed += a.Lng * b.Lat - b.Lng * a.Lat;
        }
        if (signed < 0) points.Reverse();

        var sb = new StringBuilder("POLYGON((");
        for (var i = 0; i < points.Count; i++)
        {
            var p = points[i];
            if (i > 0) sb.Append(", ");
            sb.Append(p.Lng.ToString(System.Globalization.CultureInfo.InvariantCulture))
              .Append(' ')
              .Append(p.Lat.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        sb.Append("))");
        return (sb.ToString(), input.GetRawText());
    }
}
