-- =========================================================================
-- 048_frozen_map_status.sql — distinct map_status for frozen parcels
-- =========================================================================
-- Until now a 'frozen' parcel (temporarily suspended) fell through the
-- map_status CASE to 'pending', so the officer map painted it amber and
-- labelled it "قيد المراجعة" — indistinguishable from a parcel still in
-- review. Add a dedicated 'frozen' bucket (grey) so it reads correctly.
-- Everything else is identical to 047 (incl. the public/officer conflict
-- scoping). A disputed-AND-frozen parcel still ranks as 'disputed' (first).
-- =========================================================================
USE [sarh];
GO

CREATE OR ALTER PROCEDURE dbo.property_map_features
    @p_public    BIT,
    @p_region_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH issued AS (
        SELECT N'approved' AS s UNION ALL SELECT N'minted' UNION ALL SELECT N'transferred'
    ),
    active_disp AS (
        SELECT DISTINCT property_id
        FROM property_disputes
        WHERE status = N'active'
    )
    SELECT
        p.id,
        p.property_code,
        p.parcel_number,
        p.property_type,
        p.status,
        p.region_id,
        p.area_sqm,
        p.updated_at,
        CASE WHEN d.property_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS has_active_dispute,
        -- Overlap with a parcel the VIEWER may see (public sees issued only).
        CASE WHEN EXISTS (
            SELECT 1 FROM properties q
            WHERE q.id <> p.id
              AND q.boundary_polygon IS NOT NULL
              AND (
                    (@p_public = 1 AND q.status IN (N'approved', N'minted', N'transferred'))
                 OR (@p_public = 0 AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                                                    N'approved', N'minted', N'transferred', N'frozen'))
                  )
              AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
              AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
        ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS has_location_conflict,
        -- ownership_conflict shown to everyone; location_conflict officer-only.
        CASE
            WHEN EXISTS (
                SELECT 1 FROM properties q
                WHERE q.id <> p.id
                  AND q.boundary_polygon IS NOT NULL
                  AND q.status IN (N'approved', N'minted', N'transferred')
                  AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
                  AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
            ) THEN N'ownership_conflict'
            WHEN @p_public = 0 AND EXISTS (
                SELECT 1 FROM properties q
                WHERE q.id <> p.id
                  AND q.boundary_polygon IS NOT NULL
                  AND q.status IN (N'pending', N'under_review', N'needs_clarification', N'frozen')
                  AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
                  AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
            ) THEN N'location_conflict'
            ELSE N'none'
        END AS conflict_kind,
        CASE
            WHEN d.property_id IS NOT NULL                                                   THEN N'disputed'
            WHEN p.status = N'frozen'                                                        THEN N'frozen'
            WHEN p.status IN (N'approved', N'minted', N'transferred')
                 AND p.property_type = N'governmental'                                       THEN N'public'
            WHEN p.status IN (N'approved', N'minted', N'transferred')                        THEN N'clear'
            ELSE                                                                                  N'pending'
        END AS map_status,
        c.pt.Long AS lng,
        c.pt.Lat  AS lat,
        dbo.fn_polygon_to_geojson(p.boundary_polygon) AS boundary_polygon_geojson
    FROM properties p
    CROSS APPLY (SELECT COALESCE(p.location_point, p.boundary_polygon.EnvelopeCenter()) AS pt) c
    LEFT JOIN active_disp d ON d.property_id = p.id
    WHERE p.boundary_polygon IS NOT NULL
      AND (@p_region_id IS NULL OR p.region_id = @p_region_id)
      AND (
            (@p_public = 1 AND p.status IN (SELECT s FROM issued))
            OR
            (@p_public = 0 AND p.status IN
                (N'pending', N'under_review', N'needs_clarification',
                 N'approved', N'minted', N'transferred', N'frozen'))
          );
END
GO

PRINT N'048_frozen_map_status.sql applied.';
GO
