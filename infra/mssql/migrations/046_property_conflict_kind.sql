-- =========================================================================
-- 046_property_conflict_kind.sql — distinguish the TWO overlap states
-- =========================================================================
-- Refines 045's single boolean into a derived KIND so the UI can tell the two
-- situations apart (both still WARNINGS per CLAUDE.md #3, never silent):
--   • 'ownership_conflict' — the polygon overlaps an ALREADY-ISSUED parcel
--     (approved / minted / transferred). Someone already officially owns this
--     land → "خلل في الملكية". Approval of THIS parcel is then blocked in
--     ReviewService so there can never be two approved owners of one plot.
--   • 'location_conflict'  — the polygon overlaps only OTHER not-yet-approved
--     parcels. Both stay unapproved with "تضارب في الموقع" until resolved.
--   • 'none'               — no real-area overlap.
-- has_location_conflict (045) is kept = (conflict_kind <> 'none') for callers
-- that only need the boolean. Real overlap = intersection AREA > 1 m² so two
-- parcels merely sharing a boundary line are NOT flagged.
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
        -- Boolean kept for back-compat: any real-area overlap with a live parcel.
        CASE WHEN EXISTS (
            SELECT 1 FROM properties q
            WHERE q.id <> p.id
              AND q.boundary_polygon IS NOT NULL
              AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                               N'approved', N'minted', N'transferred', N'frozen')
              AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
              AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
        ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS has_location_conflict,
        -- Derived KIND: overlap with an ISSUED parcel outranks overlap with a
        -- pending one (ownership defect is the more serious case).
        CASE
            WHEN EXISTS (
                SELECT 1 FROM properties q
                WHERE q.id <> p.id
                  AND q.boundary_polygon IS NOT NULL
                  AND q.status IN (N'approved', N'minted', N'transferred')
                  AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
                  AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
            ) THEN N'ownership_conflict'
            WHEN EXISTS (
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

PRINT N'046_property_conflict_kind.sql applied.';
GO
