using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;
using Sarh.Api.Notifications;

namespace Sarh.Api.Properties;

public sealed class PropertiesService(SarhDbContext db, NotificationsService notifications)
{
    private const decimal AREA_TOLERANCE_PCT = 5m;

    // ----- Submit -----
    public async Task<SubmitResult> SubmitAsync(CreatePropertyDto dto, CurrentUser actor, CancellationToken ct)
    {
        var ownerCitizenId = await ResolveOwnerAsync(dto, actor, ct);
        EnforceOfficerRegionScope(dto, actor);

        // region_id is a FK to regions(id) (the Shabiyah code). Validate it
        // up-front so an unknown code returns a clean 422 instead of a raw
        // FK-violation 500 surfacing from insert_property_with_polygon.
        if (!await db.Regions.AsNoTracking().AnyAsync(r => r.Id == dto.RegionId, ct))
            throw SarhException.Validation(
                $"المنطقة (الرمز {dto.RegionId}) غير معروفة. استخدم رمز شعبية معتمداً.",
                $"Unknown region_id {dto.RegionId}. Use a valid Shabiyah region code.",
                new { region_id = dto.RegionId });

        // Required evidence: real-world parcels are rarely clean rectangles,
        // so the area is taken from the drawn polygon (below) — never from
        // length × width — and the citizen must instead attach photos of the
        // property and a koreky (croquis) sketch of its boundaries.
        var documents = ValidateDocuments(dto.Documents);

        var (wkt, geoJson) = GeoJsonPolygon.ValidateAndConvert(dto.BoundaryPolygon);

        // Server-side area + centroid pre-check. SQL Server geography STArea
        // returns square metres directly on WGS84 (no UTM transform needed).
        var validation = await ComputeValidationAsync(wkt, dto.AreaSqm, ct);

        if (validation.AreaDiffPct is decimal diff && diff > AREA_TOLERANCE_PCT)
        {
            throw SarhException.Validation(
                $"الفرق بين المساحة المُدخلة ({dto.AreaSqm} م²) والمساحة المحسوبة من الإحداثيات ({validation.ComputedAreaSqm} م²) يتجاوز ±{AREA_TOLERANCE_PCT}%.",
                $"Claimed area {dto.AreaSqm} differs from computed {validation.ComputedAreaSqm} by {diff}% (max {AREA_TOLERANCE_PCT}%).",
                new { computed_area_sqm = validation.ComputedAreaSqm, area_diff_pct = diff });
        }

        if (validation.HasApprovedCentroidMatch)
        {
            throw SarhException.Conflict(
                $"يوجد عقار معتمد مسبقاً بنفس الإحداثيات (الرمز {validation.MatchedPropertyCode}).",
                $"An approved property with the same centroid exists (code {validation.MatchedPropertyCode}).");
        }

        // Soft location-conflict check (CLAUDE.md #3: overlap is a WARNING, not a
        // hard block — legacy paper deeds may legitimately conflict). Surfaces a
        // possible double-registration to the reviewer without rejecting the
        // request. An exact-centroid duplicate is the only HARD block (above).
        var locationConflicts = await LocationConflictsForWktAsync(wkt, excludeId: null, ct);

        // insert_property_with_polygon already accepts WKT and parses GeoJSON.
        var propertyId = await CallInsertPropertyAsync(dto, wkt, ownerCitizenId, ct);

        await InsertDocumentsAsync(propertyId, ownerCitizenId, documents, ct);

        // Optional "area per the paper deed" — stored for the reviewer's
        // cross-check (PropertyView computes the % divergence). Not part of
        // insert_property_with_polygon's signature, so set it separately.
        if (dto.DocumentedAreaSqm is decimal docArea && docArea > 0)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE properties SET documented_area_sqm = {docArea} WHERE id = {propertyId};", ct);
        }

        var requestNo = await NextRequestNoAsync(DateTime.UtcNow.Year, ct);

        var requestId = Guid.NewGuid();
        // submitted_by_citizen_id is the OWNER, not the actor — keeps the
        // column semantically meaningful when an officer is submitting on
        // behalf of a citizen. The audit interceptor still captures the
        // real actor (officer or citizen) for accountability.
        await db.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT INTO registration_requests
                (id, property_id, request_no, submitted_by_citizen_id, current_status)
            VALUES
                ({requestId}, {propertyId}, {requestNo}, {ownerCitizenId}, N'pending');
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
            var body = locationConflicts.Count > 0
                ? $"وصل طلب جديد رقم {requestNo} يحتاج إلى مراجعة. تنبيه: تتداخل حدوده مع {locationConflicts.Count} قطعة مسجّلة (تضارب في الموقع)."
                : $"وصل طلب جديد رقم {requestNo} يحتاج إلى مراجعة.";
            await notifications.NotifyReviewersInRegionAsync(
                rid,
                locationConflicts.Count > 0 ? "طلب تسجيل عقار — تضارب في الموقع" : "طلب تسجيل عقار جديد",
                body,
                new { property_id = propertyId, request_no = requestNo, has_location_conflict = locationConflicts.Count > 0 },
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
                LocationConflicts = locationConflicts,
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
            if (actor.CitizenId is null) throw SarhException.Forbidden();
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
                throw SarhException.Forbidden("الموظف غير مرتبط بمنطقة محدّدة.");
            if (q.RegionId is not null && q.RegionId != actor.RegionId)
                throw SarhException.Forbidden("لا يمكنك عرض عقارات من خارج منطقتك.");
            query = query.Where(p => p.RegionId == actor.RegionId);
        }

        if (!string.IsNullOrWhiteSpace(q.Q) && q.Q.Trim().Length >= 2)
        {
            var term = q.Q.Trim();
            var pat = "%" + term.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
            query = query.Where(p =>
                EF.Functions.Like(p.PropertyCode ?? "", pat) ||
                EF.Functions.Like(p.ParcelNumber ?? "", pat) ||
                EF.Functions.Like(p.AddressAr ?? "", pat) ||
                EF.Functions.Like(p.PlanNumber ?? "", pat));
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
            ?? throw SarhException.NotFound("العقار", "Property");

        if (actor.Role == "citizen" && p.OwnerCitizenId != actor.CitizenId)
            throw SarhException.Forbidden();
        if (actor.Role is "registry_officer" or "reviewer" or "id_issuer" &&
            actor.RegionId is not null && p.RegionId != actor.RegionId)
            throw SarhException.Forbidden("العقار خارج منطقتك.");

        var view = PropertyView.From(p);
        view.BoundaryPolygon = await GetBoundaryPolygonGeoJsonAsync(id, ct);
        view.HasActiveDispute = await db.PropertyDisputes.AsNoTracking()
            .AnyAsync(d => d.PropertyId == id && d.Status == "active", ct);
        // Geometric "تضارب في الموقع": parcels this one overlaps by a real area.
        view.LocationConflicts = await LocationConflictsForPropertyAsync(id, ct);
        view.HasLocationConflict = view.LocationConflicts.Count > 0;
        view.ConflictKind = ClassifyConflict(view.LocationConflicts);
        return view;
    }

    // Reads boundary_polygon as WKT and converts it to a GeoJSON Polygon so
    // the web review/approval map can render the exact shape. SQL Server
    // geography emits WKT in "longitude latitude" order, which is already the
    // GeoJSON axis order — no swap needed.
    private async Task<object?> GetBoundaryPolygonGeoJsonAsync(Guid id, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT boundary_polygon.STAsText() FROM properties WHERE id = @id AND boundary_polygon IS NOT NULL;";
        cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = id });
        var wkt = await cmd.ExecuteScalarAsync(ct) as string;
        if (string.IsNullOrWhiteSpace(wkt)) return null;

        // "POLYGON ((lng lat, lng lat, …))" — take the first (outer) ring.
        var open = wkt.IndexOf("((", StringComparison.Ordinal);
        var close = wkt.IndexOf("))", StringComparison.Ordinal);
        if (open < 0 || close < 0 || close <= open) return null;
        var ringText = wkt.Substring(open + 2, close - open - 2);

        var ring = new List<double[]>();
        foreach (var pair in ringText.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = pair.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) continue;
            if (double.TryParse(parts[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var lng) &&
                double.TryParse(parts[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var lat))
            {
                ring.Add(new[] { lng, lat });
            }
        }
        if (ring.Count < 4) return null;
        return new { type = "Polygon", coordinates = new[] { ring.ToArray() } };
    }

    // ----- Update boundary (redraw polygon) -----
    // Lets an officer (or the owning citizen, while the parcel is still in the
    // workflow) correct the drawn boundary. The area + centroid are recomputed
    // authoritatively from the new polygon; the WKT centroid copy is refreshed
    // by tr_properties_set_centroid so the anti-duplicate index stays correct.
    public async Task<PropertyView> UpdateBoundaryAsync(
        Guid id, UpdateBoundaryDto dto, CurrentUser actor, CancellationToken ct)
    {
        var p = await db.Properties.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        AuthorizeBoundaryEdit(p, actor);

        var (wkt, _) = GeoJsonPolygon.ValidateAndConvert(dto.BoundaryPolygon);

        // An approved parcel may not be moved onto another approved parcel's
        // exact centroid (the hard uniqueness guard). Pre-check so we return a
        // clean 409 instead of a raw unique-index violation.
        if (p.Status == "approved")
        {
            var clashCode = await ApprovedCentroidClashAsync(id, wkt, ct);
            if (clashCode is not null)
                throw SarhException.Conflict(
                    $"يوجد عقار معتمد آخر بنفس الإحداثيات (الرمز {clashCode}).",
                    $"Another approved property shares the same centroid (code {clashCode}).");
        }

        await ExecUpdateBoundaryAsync(id, wkt, ct);

        var updated = await db.Properties.AsNoTracking().FirstAsync(x => x.Id == id, ct);
        var view = PropertyView.From(updated);
        view.BoundaryPolygon = await GetBoundaryPolygonGeoJsonAsync(id, ct);
        view.HasActiveDispute = await db.PropertyDisputes.AsNoTracking()
            .AnyAsync(d => d.PropertyId == id && d.Status == "active", ct);
        // Redrawing changes the geometry — recompute the overlap warning.
        view.LocationConflicts = await LocationConflictsForPropertyAsync(id, ct);
        view.HasLocationConflict = view.LocationConflicts.Count > 0;
        view.ConflictKind = ClassifyConflict(view.LocationConflicts);
        return view;
    }

    // Who may redraw a parcel:
    //   • super_admin — any parcel.
    //   • registry_officer / reviewer / department_manager — own region only.
    //   • the owning citizen — only while the parcel is still in the workflow
    //     (a signed/approved deed's geometry is officer-territory).
    //   • auditor / id_issuer — never.
    private static void AuthorizeBoundaryEdit(Data.Entities.Property p, CurrentUser actor)
    {
        switch (actor.Role)
        {
            case "super_admin":
                return;
            case "registry_officer":
            case "reviewer":
            case "department_manager":
                if (actor.RegionId is int rid && p.RegionId != rid)
                    throw SarhException.Forbidden("العقار خارج منطقتك.");
                return;
            case "citizen":
                if (actor.CitizenId is null || p.OwnerCitizenId != actor.CitizenId)
                    throw SarhException.Forbidden();
                if (p.Status is "approved" or "minted" or "transferred")
                    throw SarhException.Forbidden(
                        "لا يمكن تعديل حدود عقار صدر سنده. تواصل مع مكتب التسجيل.");
                return;
            default:
                throw SarhException.Forbidden();
        }
    }

    private async Task<string?> ApprovedCentroidClashAsync(Guid id, string wkt, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326);
            DECLARE @c geography = @poly.EnvelopeCenter();
            SELECT TOP (1) p.property_code
            FROM properties p
            WHERE p.id <> @id
              AND p.status = N'approved'
              AND p.location_point IS NOT NULL
              AND p.location_point.STEquals(@c) = 1;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, -1) { Value = wkt });
        cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = id });
        return await cmd.ExecuteScalarAsync(ct) as string;
    }

    private async Task ExecUpdateBoundaryAsync(Guid id, string wkt, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        // QUOTED_IDENTIFIER/ANSI_NULLS ON are required for the spatial-index
        // update triggered by writing boundary_polygon. Area is the polygon's
        // STArea (m²); location_point is the new envelope centre. The
        // AFTER UPDATE trigger refreshes location_point_wkt to match.
        cmd.CommandText =
            "SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; " +
            "DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326); " +
            "UPDATE properties SET " +
            "  boundary_polygon = @poly, " +
            "  location_point   = @poly.EnvelopeCenter(), " +
            "  area_sqm         = CAST(@poly.STArea() AS DECIMAL(14,2)), " +
            "  updated_at       = SYSDATETIMEOFFSET() " +
            "WHERE id = @id;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, -1) { Value = wkt });
        cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = id });
        await cmd.ExecuteNonQueryAsync(ct);
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

    // ----- Location conflict (soft overlap / double-registration) -----
    // Mirrors dbo.find_property_location_conflicts (045): registered/live parcels
    // whose polygon overlaps @wkt by a REAL area (> 1 m²), so two parcels merely
    // sharing a boundary line (area 0) are NOT reported. overlap_pct is relative
    // to the SUBMITTED polygon's area. @excludeId omits the parcel itself.
    private async Task<IReadOnlyList<PropertyOverlap>> LocationConflictsForWktAsync(
        string wkt, Guid? excludeId, CancellationToken ct)
    {
        var rows = new List<PropertyOverlap>();
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326);
            SELECT q.id, q.property_code, q.parcel_number,
                   ROUND(CAST(q.boundary_polygon.STIntersection(@poly).STArea() AS DECIMAL(18,6))
                         / NULLIF(CAST(@poly.STArea() AS DECIMAL(18,6)), 0) * 100.0, 2) AS overlap_pct,
                   q.status AS other_status
            FROM properties q
            WHERE (@exclude IS NULL OR q.id <> @exclude)
              AND q.boundary_polygon IS NOT NULL
              AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                               N'approved', N'minted', N'transferred', N'frozen')
              AND q.boundary_polygon.STIntersects(@poly) = 1
              AND q.boundary_polygon.STIntersection(@poly).STArea() > 1.0
            ORDER BY overlap_pct DESC;";
        cmd.Parameters.Add(new SqlParameter("@wkt", SqlDbType.NVarChar, -1) { Value = wkt });
        cmd.Parameters.Add(new SqlParameter("@exclude", SqlDbType.UniqueIdentifier)
            { Value = (object?)excludeId ?? DBNull.Value });

        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new PropertyOverlap
            {
                PropertyId = r.GetGuid(0),
                PropertyCode = r.IsDBNull(1) ? null : r.GetString(1),
                ParcelNumber = r.IsDBNull(2) ? null : r.GetString(2),
                OverlapPct = r.IsDBNull(3) ? null : r.GetDecimal(3),
                OtherStatus = r.IsDBNull(4) ? null : r.GetString(4),
            });
        }
        return rows;
    }

    // Classifies a conflict list into the displayed state:
    //   ownership_conflict — overlaps an ISSUED parcel (approved/minted/transferred)
    //   location_conflict  — overlaps only not-yet-approved parcels
    //   none               — no overlaps
    private static readonly HashSet<string> IssuedStatuses = new(StringComparer.Ordinal)
        { "approved", "minted", "transferred" };

    internal static string ClassifyConflict(IReadOnlyList<PropertyOverlap> conflicts)
    {
        if (conflicts.Count == 0) return "none";
        return conflicts.Any(c => c.OtherStatus is not null && IssuedStatuses.Contains(c.OtherStatus))
            ? "ownership_conflict"
            : "location_conflict";
    }

    // Conflicts for an already-stored parcel (reads its own polygon as WKT).
    private async Task<IReadOnlyList<PropertyOverlap>> LocationConflictsForPropertyAsync(Guid id, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT boundary_polygon.STAsText() FROM properties WHERE id = @id AND boundary_polygon IS NOT NULL;";
        cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = id });
        var wkt = await cmd.ExecuteScalarAsync(ct) as string;
        if (string.IsNullOrWhiteSpace(wkt)) return Array.Empty<PropertyOverlap>();
        return await LocationConflictsForWktAsync(wkt, excludeId: id, ct);
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

    // ----- Documents -----

    // Registry policy: every submission must carry at least one site photo
    // and at least one koreky (croquis) sketch. Returns the normalised list
    // ready for insertion. Throws SarhException.Validation on any gap.
    private static List<PropertyDocumentDto> ValidateDocuments(List<PropertyDocumentDto>? docs)
    {
        var list = docs?.Where(d => !string.IsNullOrWhiteSpace(d.StoragePath)).ToList()
                   ?? new List<PropertyDocumentDto>();

        var hasPhoto = list.Any(d => d.DocumentType == "site_photo");
        var hasKoreky = list.Any(d => d.DocumentType == "koreky_certificate");

        if (!hasPhoto || !hasKoreky)
        {
            throw SarhException.Validation(
                "يلزم إرفاق صورة واحدة للعقار على الأقل وكروكي واحد قبل الإرسال.",
                "At least one site photo and one koreky (croquis) sketch are required.",
                new { has_site_photo = hasPhoto, has_koreky = hasKoreky });
        }
        return list;
    }

    private async Task InsertDocumentsAsync(
        Guid propertyId, Guid ownerCitizenId, List<PropertyDocumentDto> docs, CancellationToken ct)
    {
        if (docs.Count == 0) return;

        foreach (var d in docs)
        {
            db.PropertyDocuments.Add(new PropertyDocument
            {
                Id = Guid.NewGuid(),
                PropertyId = propertyId,
                DocumentType = d.DocumentType,
                TitleAr = d.TitleAr,
                StoragePath = d.StoragePath,
                MimeType = d.MimeType,
                FileSizeBytes = d.FileSizeBytes,
                FileHash = d.FileHash,
                UploadedByCitizenId = ownerCitizenId,
                // Set explicitly: EF would otherwise INSERT default(DateTimeOffset)
                // and bypass the column's SYSDATETIMEOFFSET() default.
                UploadedAt = DateTimeOffset.UtcNow,
            });
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<PropertyDocumentView>> ListDocumentsAsync(
        Guid propertyId, CurrentUser actor, CancellationToken ct)
    {
        // Reuse GetByIdAsync's access rules: it throws Forbidden/NotFound as
        // appropriate for citizens (own only) and officers (own region).
        await GetByIdAsync(propertyId, actor, ct);

        var rows = await db.PropertyDocuments.AsNoTracking()
            .Where(d => d.PropertyId == propertyId)
            .OrderBy(d => d.UploadedAt)
            .ToListAsync(ct);
        return rows.Select(PropertyDocumentView.From).ToList();
    }

    // Resolves a single document for streaming, after enforcing the same
    // access rules as GetByIdAsync. Returns the "<bucket>/<path>" location.
    public async Task<(string Bucket, string Path, string? MimeType)> ResolveDocumentFileAsync(
        Guid propertyId, Guid documentId, CurrentUser actor, CancellationToken ct)
    {
        await GetByIdAsync(propertyId, actor, ct);

        var doc = await db.PropertyDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == documentId && d.PropertyId == propertyId, ct)
            ?? throw SarhException.NotFound("المستند", "Document");

        var slash = doc.StoragePath.IndexOf('/');
        if (slash <= 0) throw SarhException.NotFound("المستند", "Document");
        return (doc.StoragePath[..slash], doc.StoragePath[(slash + 1)..], doc.MimeType);
    }

    // ----- helpers -----
    private async Task<Guid> ResolveOwnerAsync(CreatePropertyDto dto, CurrentUser actor, CancellationToken ct)
    {
        // Citizen submitting in their own name. They may omit owner_citizen_id
        // or echo their own id — anything else is a proxy attempt and gets 403.
        if (actor.CitizenId is Guid selfCit)
        {
            if (dto.OwnerCitizenId is Guid req && req != selfCit)
            {
                throw SarhException.Forbidden(
                    "لا يمكن للمواطن تسجيل عقار باسم شخص آخر.");
            }
            return selfCit;
        }

        // Officer (or any non-citizen actor) submitting on behalf of a citizen.
        // owner_citizen_id is required, and must point to an active citizen row.
        if (dto.OwnerCitizenId is not Guid ownerId)
        {
            throw SarhException.Validation(
                "حقل owner_citizen_id مطلوب عند تسجيل عقار نيابةً عن مواطن.",
                "owner_citizen_id is required when an officer submits on behalf of a citizen.");
        }
        var exists = await db.Citizens.AsNoTracking()
            .AnyAsync(c => c.Id == ownerId && c.IsActive, ct);
        if (!exists) throw SarhException.NotFound("المواطن", "Citizen");
        return ownerId;
    }

    private static void EnforceOfficerRegionScope(CreatePropertyDto dto, CurrentUser actor)
    {
        // Region scope only matters when an officer is the actor. Citizens
        // may register property in any region of Libya.
        if (actor.OfficerId is null) return;
        if (actor.Role is "super_admin" or "auditor") return;
        if (actor.RegionId is not int region || region != dto.RegionId)
        {
            throw SarhException.Forbidden(
                "لا يمكنك تسجيل عقار خارج منطقتك.");
        }
    }

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
            throw SarhException.Upstream("validate returned no row");
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
            ?? throw SarhException.Upstream("insert_property_with_polygon returned no id");
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
            ?? throw SarhException.Upstream("next_registration_request_no returned null");
        return s;
    }
}

