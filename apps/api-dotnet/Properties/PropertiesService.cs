using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Auth;
using Sijilli.Api.Common;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;
using Sijilli.Api.Data.Entities;
using Sijilli.Api.Notifications;

namespace Sijilli.Api.Properties;

public sealed class PropertiesService(SijilliDbContext db, NotificationsService notifications)
{
    private const decimal AREA_TOLERANCE_PCT = 5m;

    // ----- Submit -----
    public async Task<SubmitResult> SubmitAsync(CreatePropertyDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.CitizenId is null)
            throw SijilliException.Forbidden("فقط المواطنون يمكنهم تقديم طلبات تسجيل عقار.");

        var (wkt, geoJson) = GeoJsonPolygon.ValidateAndConvert(dto.BoundaryPolygon);

        // Server-side area + centroid pre-check. SQL Server geography STArea
        // returns square metres directly on WGS84 (no UTM transform needed).
        var validation = await ComputeValidationAsync(wkt, dto.AreaSqm, ct);

        if (validation.AreaDiffPct is decimal diff && diff > AREA_TOLERANCE_PCT)
        {
            throw SijilliException.Validation(
                $"الفرق بين المساحة المُدخلة ({dto.AreaSqm} م²) والمساحة المحسوبة من الإحداثيات ({validation.ComputedAreaSqm} م²) يتجاوز ±{AREA_TOLERANCE_PCT}%.",
                $"Claimed area {dto.AreaSqm} differs from computed {validation.ComputedAreaSqm} by {diff}% (max {AREA_TOLERANCE_PCT}%).",
                new { computed_area_sqm = validation.ComputedAreaSqm, area_diff_pct = diff });
        }

        if (validation.HasApprovedCentroidMatch)
        {
            throw SijilliException.Conflict(
                $"يوجد عقار معتمد مسبقاً بنفس الإحداثيات (الرمز {validation.MatchedPropertyCode}).",
                $"An approved property with the same centroid exists (code {validation.MatchedPropertyCode}).");
        }

        // insert_property_with_polygon already accepts WKT and parses GeoJSON.
        var propertyId = await CallInsertPropertyAsync(dto, wkt, actor.CitizenId.Value, ct);

        var requestNo = await NextRequestNoAsync(DateTime.UtcNow.Year, ct);

        var requestId = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT INTO registration_requests
                (id, property_id, request_no, submitted_by_citizen_id, current_status)
            VALUES
                ({requestId}, {propertyId}, {requestNo}, {actor.CitizenId.Value}, N'pending');
        ", ct);

        var property = await db.Properties.AsNoTracking().FirstAsync(p => p.Id == propertyId, ct);
        var reg = new RegistrationRequestView
        {
            Id = requestId,
            RequestNo = requestNo,
            PropertyId = propertyId,
            CurrentStatus = "pending",
            SubmittedAt = property.SubmittedAt ?? DateTimeOffset.UtcNow,
        };

        if (property.RegionId is int rid)
        {
            await notifications.NotifyReviewersInRegionAsync(
                rid,
                "طلب تسجيل عقار جديد",
                $"وصل طلب جديد رقم {requestNo} يحتاج إلى مراجعة.",
                new { property_id = propertyId, request_no = requestNo },
                ct);
        }

        return new SubmitResult
        {
            Property = PropertyView.From(property),
            RegistrationRequest = reg,
            Validation = new ValidationResult
            {
                ComputedAreaSqm = validation.ComputedAreaSqm,
                AreaDiffPct = validation.AreaDiffPct,
            },
        };
    }

    // ----- List -----
    public async Task<CursorPage<PropertyView>> ListAsync(ListPropertiesQuery q, CurrentUser actor, CancellationToken ct)
    {
        IQueryable<Property> query = db.Properties.AsNoTracking();

        if (!string.IsNullOrEmpty(q.Status)) query = query.Where(p => p.Status == q.Status);

        if (actor.Role == "citizen")
        {
            if (actor.CitizenId is null) throw SijilliException.Forbidden();
            query = query.Where(p => p.OwnerCitizenId == actor.CitizenId);
        }
        else if (actor.Role is "super_admin" or "auditor")
        {
            if (q.RegionId is not null) query = query.Where(p => p.RegionId == q.RegionId);
        }
        else
        {
            // registry_officer / reviewer / id_issuer scope to own region.
            if (actor.RegionId is null)
                throw SijilliException.Forbidden("الموظف غير مرتبط بمنطقة محدّدة.");
            if (q.RegionId is not null && q.RegionId != actor.RegionId)
                throw SijilliException.Forbidden("لا يمكنك عرض عقارات من خارج منطقتك.");
            query = query.Where(p => p.RegionId == actor.RegionId);
        }

        if (!string.IsNullOrWhiteSpace(q.Cursor) &&
            DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
        {
            query = query.Where(p => p.CreatedAt < cursorTs);
        }

        var rows = await query
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            nextCursor = rows[q.Limit].CreatedAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }

        return new CursorPage<PropertyView>
        {
            Items = rows.Select(PropertyView.From).ToList(),
            NextCursor = nextCursor,
        };
    }

    // ----- Get by id -----
    public async Task<PropertyView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)
    {
        var p = await db.Properties.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SijilliException.NotFound("العقار", "Property");

        if (actor.Role == "citizen" && p.OwnerCitizenId != actor.CitizenId)
            throw SijilliException.Forbidden();
        if (actor.Role is "registry_officer" or "reviewer" or "id_issuer" &&
            actor.RegionId is not null && p.RegionId != actor.RegionId)
            throw SijilliException.Forbidden("العقار خارج منطقتك.");

        return PropertyView.From(p);
    }

    // ----- Overlap check -----
    public async Task<IReadOnlyList<PropertyOverlap>> OverlapCheckAsync(OverlapCheckDto dto, CancellationToken ct)
    {
        var (wkt, _) = GeoJsonPolygon.ValidateAndConvert(dto.Polygon);
        var rows = new List<PropertyOverlap>();

        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326);
            SELECT p.id, p.property_code, p.parcel_number,
                   ROUND(CAST(p.boundary_polygon.STIntersection(@poly).STArea() AS DECIMAL(18,6))
                         / NULLIF(CAST(@poly.STArea() AS DECIMAL(18,6)), 0) * 100.0, 2) AS overlap_pct
            FROM properties p
            WHERE p.boundary_polygon IS NOT NULL
              AND p.status = N'approved'
              AND p.boundary_polygon.STIntersects(@poly) = 1;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, -1) { Value = wkt });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new PropertyOverlap
            {
                PropertyId = r.GetGuid(0),
                PropertyCode = r.IsDBNull(1) ? null : r.GetString(1),
                ParcelNumber = r.IsDBNull(2) ? null : r.GetString(2),
                OverlapPct = r.IsDBNull(3) ? null : r.GetDecimal(3),
            });
        }
        return rows;
    }

    // ----- Nearby -----
    public async Task<IReadOnlyList<PropertyNearby>> NearbyAsync(NearbyQuery q, CancellationToken ct)
    {
        var rows = new List<PropertyNearby>();
        var wkt = $"POINT({q.Lng.ToString(System.Globalization.CultureInfo.InvariantCulture)} {q.Lat.ToString(System.Globalization.CultureInfo.InvariantCulture)})";

        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DECLARE @origin geography = geography::STGeomFromText(@wkt, 4326);
            SELECT TOP (@lim)
                p.id, p.property_code, p.parcel_number, p.property_type, p.status, p.area_sqm,
                ROUND(CAST(p.location_point.STDistance(@origin) AS DECIMAL(12,2)), 2) AS distance_m
            FROM properties p
            WHERE p.location_point IS NOT NULL
              AND p.location_point.STDistance(@origin) <= @rad
            ORDER BY p.location_point.STDistance(@origin) ASC;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, 200) { Value = wkt });
        cmd.Parameters.Add(new SqlParameter("@rad", SqlDbType.Decimal) { Value = q.RadiusM });
        cmd.Parameters.Add(new SqlParameter("@lim", SqlDbType.Int) { Value = q.Limit });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new PropertyNearby
            {
                Id = r.GetGuid(0),
                PropertyCode = r.IsDBNull(1) ? null : r.GetString(1),
                ParcelNumber = r.IsDBNull(2) ? null : r.GetString(2),
                PropertyType = r.IsDBNull(3) ? null : r.GetString(3),
                Status = r.IsDBNull(4) ? null : r.GetString(4),
                AreaSqm = r.IsDBNull(5) ? null : r.GetDecimal(5),
                DistanceM = r.IsDBNull(6) ? null : r.GetDecimal(6),
            });
        }
        return rows;
    }

    // ----- helpers -----
    private record ValidationRow(decimal ComputedAreaSqm, decimal? AreaDiffPct,
        bool HasApprovedCentroidMatch, Guid? MatchedPropertyId, string? MatchedPropertyCode);

    private async Task<ValidationRow> ComputeValidationAsync(string wkt, decimal areaSqm, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326);
            DECLARE @computed DECIMAL(14,2) = CAST(@poly.STArea() AS DECIMAL(14,2));
            DECLARE @diff DECIMAL(7,2) = CASE
                WHEN @area IS NULL OR @area = 0 THEN NULL
                ELSE CAST(ABS(@computed - @area) / @area * 100 AS DECIMAL(7,2))
            END;
            DECLARE @centroid geography = @poly.EnvelopeCenter();
            DECLARE @match_id UNIQUEIDENTIFIER, @match_code NVARCHAR(32);
            SELECT TOP (1) @match_id = p.id, @match_code = p.property_code
            FROM properties p
            WHERE p.status = N'approved'
              AND p.location_point IS NOT NULL
              AND p.location_point.STEquals(@centroid) = 1;
            SELECT @computed AS computed, @diff AS diff,
                   CASE WHEN @match_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS has_match,
                   @match_id AS match_id, @match_code AS match_code;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, -1) { Value = wkt });
        cmd.Parameters.Add(new SqlParameter("@area", SqlDbType.Decimal) { Value = areaSqm });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct))
            throw SijilliException.Upstream("validate returned no row");
        return new ValidationRow(
            r.GetDecimal(0),
            r.IsDBNull(1) ? null : r.GetDecimal(1),
            r.GetBoolean(2),
            r.IsDBNull(3) ? null : r.GetGuid(3),
            r.IsDBNull(4) ? null : r.GetString(4));
    }

    private async Task<Guid> CallInsertPropertyAsync(CreatePropertyDto dto, string wkt, Guid ownerCitizenId, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        // QUOTED_IDENTIFIER + ANSI_NULLS must be ON for triggers that touch
        // the geography column to satisfy spatial-index operations.
        cmd.CommandText =
            "SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; " +
            "EXEC dbo.insert_property_with_polygon " +
            "@p_owner_citizen_id, @p_property_type, @p_region_id, @p_municipality_id, @p_address_ar, " +
            "@p_parcel_number, @p_plan_number, @p_block_number, @p_polygon, " +
            "@p_area_sqm, @p_length_m, @p_width_m, @p_depth_m;";
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@p_owner_citizen_id", SqlDbType.UniqueIdentifier) { Value = ownerCitizenId },
            new SqlParameter("@p_property_type", SqlDbType.NVarChar, 16) { Value = dto.PropertyType },
            new SqlParameter("@p_region_id", SqlDbType.Int) { Value = dto.RegionId },
            new SqlParameter("@p_municipality_id", SqlDbType.Int) { Value = (object?)dto.MunicipalityId ?? DBNull.Value },
            new SqlParameter("@p_address_ar", SqlDbType.NVarChar, -1) { Value = (object?)dto.AddressAr ?? DBNull.Value },
            new SqlParameter("@p_parcel_number", SqlDbType.NVarChar, 32) { Value = (object?)dto.ParcelNumber ?? DBNull.Value },
            new SqlParameter("@p_plan_number", SqlDbType.NVarChar, 32) { Value = (object?)dto.PlanNumber ?? DBNull.Value },
            new SqlParameter("@p_block_number", SqlDbType.NVarChar, 32) { Value = (object?)dto.BlockNumber ?? DBNull.Value },
            new SqlParameter("@p_polygon", SqlDbType.NVarChar, -1) { Value = wkt },
            new SqlParameter("@p_area_sqm", SqlDbType.Decimal) { Value = dto.AreaSqm },
            new SqlParameter("@p_length_m", SqlDbType.Decimal) { Value = (object?)dto.LengthM ?? DBNull.Value },
            new SqlParameter("@p_width_m",  SqlDbType.Decimal) { Value = (object?)dto.WidthM ?? DBNull.Value },
            new SqlParameter("@p_depth_m",  SqlDbType.Decimal) { Value = (object?)dto.DepthM ?? DBNull.Value },
        });
        var id = (Guid?)await cmd.ExecuteScalarAsync(ct)
            ?? throw SijilliException.Upstream("insert_property_with_polygon returned no id");
        return id;
    }

    private async Task<string> NextRequestNoAsync(int year, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "EXEC dbo.next_registration_request_no @p_year;";
        cmd.Parameters.Add(new SqlParameter("@p_year", SqlDbType.Int) { Value = year });
        var s = (string?)await cmd.ExecuteScalarAsync(ct)
            ?? throw SijilliException.Upstream("next_registration_request_no returned null");
        return s;
    }
}

