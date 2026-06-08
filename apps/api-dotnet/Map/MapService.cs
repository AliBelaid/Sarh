using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;

namespace Sarh.Api.Map;

// Assembles the parcel GeoJSON feeds backing the two map surfaces. Both feeds
// expose PUBLIC attributes only (no owner / national number); the difference
// is which parcels are in scope:
//   • PublicMapAsync  — deed-issued parcels, no auth (verify.sarh.ly map).
//   • OfficerMapAsync — every live parcel in the officer's region scope.
public sealed class MapService(SarhDbContext db)
{
    public Task<MapFeatureCollection> PublicMapAsync(int? regionId, CancellationToken ct)
        => BuildAsync(isPublic: true, regionId: regionId, ct);

    public Task<MapFeatureCollection> OfficerMapAsync(CurrentUser actor, int? regionId, CancellationToken ct)
    {
        // Product decision: the in-app parcel map shows EVERY live parcel across
        // ALL regions to any authenticated user (public attributes only — no
        // owner / national number leaves here). region_id stays an OPTIONAL
        // narrowing filter; it is no longer force-scoped to the actor's own
        // region, so even a region-unassigned reviewer sees the full country
        // map instead of a Forbidden error.
        _ = actor; // actor kept for audit/signature parity; scope is no longer role-gated.
        return BuildAsync(isPublic: false, regionId: regionId, ct);
    }

    private async Task<MapFeatureCollection> BuildAsync(bool isPublic, int? regionId, CancellationToken ct)
    {
        var features = new List<MapFeature>();

        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "EXEC dbo.property_map_features @p_public, @p_region_id;";
        cmd.Parameters.Add(new SqlParameter("@p_public", SqlDbType.Bit) { Value = isPublic });
        cmd.Parameters.Add(new SqlParameter("@p_region_id", SqlDbType.Int)
            { Value = (object?)regionId ?? DBNull.Value });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        var oId = r.GetOrdinal("id");
        var oCode = r.GetOrdinal("property_code");
        var oParcel = r.GetOrdinal("parcel_number");
        var oType = r.GetOrdinal("property_type");
        var oStatus = r.GetOrdinal("status");
        var oRegion = r.GetOrdinal("region_id");
        var oArea = r.GetOrdinal("area_sqm");
        var oUpdated = r.GetOrdinal("updated_at");
        var oDispute = r.GetOrdinal("has_active_dispute");
        var oConflict = r.GetOrdinal("has_location_conflict");
        // Tolerate an older proc build that predates migration 046 (e.g. when a
        // numbered migration was baseline-skipped on an incremental dev DB, the
        // live proc may not yet return conflict_kind). Degrade to "none" rather
        // than throwing IndexOutOfRangeException → 500 on the whole map feed.
        var oConflictKind = SafeOrdinal(r, "conflict_kind");
        var oMapStatus = r.GetOrdinal("map_status");
        var oLng = r.GetOrdinal("lng");
        var oLat = r.GetOrdinal("lat");
        var oGeo = r.GetOrdinal("boundary_polygon_geojson");

        while (await r.ReadAsync(ct))
        {
            JsonElement? geometry = null;
            if (!r.IsDBNull(oGeo))
            {
                var s = r.GetString(oGeo);
                if (!string.IsNullOrEmpty(s))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(s);
                        geometry = doc.RootElement.Clone();
                    }
                    catch (JsonException) { geometry = null; }
                }
            }
            // A parcel with no renderable polygon is useless on a map — skip it.
            if (geometry is null) continue;

            features.Add(new MapFeature
            {
                Geometry = geometry,
                Properties = new MapFeatureProps
                {
                    Id = r.GetGuid(oId),
                    PropertyCode = r.IsDBNull(oCode) ? null : r.GetString(oCode),
                    ParcelNumber = r.IsDBNull(oParcel) ? null : r.GetString(oParcel),
                    PropertyType = r.GetString(oType),
                    Status = r.GetString(oStatus),
                    MapStatus = r.GetString(oMapStatus),
                    RegionId = r.IsDBNull(oRegion) ? null : r.GetInt32(oRegion),
                    AreaSqm = r.IsDBNull(oArea) ? null : r.GetDecimal(oArea),
                    UpdatedAt = r.GetDateTimeOffset(oUpdated),
                    HasActiveDispute = r.GetBoolean(oDispute),
                    HasLocationConflict = r.GetBoolean(oConflict),
                    ConflictKind = oConflictKind < 0 || r.IsDBNull(oConflictKind) ? "none" : r.GetString(oConflictKind),
                    Lng = r.IsDBNull(oLng) ? 0 : r.GetDouble(oLng),
                    Lat = r.IsDBNull(oLat) ? 0 : r.GetDouble(oLat),
                },
            });
        }

        return new MapFeatureCollection { Features = features };
    }

    // GetOrdinal that returns -1 instead of throwing when a column is absent
    // from the result set (lets the feed survive a partially-migrated proc).
    private static int SafeOrdinal(SqlDataReader r, string name)
    {
        try { return r.GetOrdinal(name); }
        catch (IndexOutOfRangeException) { return -1; }
    }
}
