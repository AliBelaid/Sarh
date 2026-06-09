-- =========================================================================
-- 047_public_map_conflict_scope.sql — don't leak pending parcels publicly
-- =========================================================================
-- 045/046 compute has_location_conflict / conflict_kind against ALL live
-- parcels (pending / under_review / needs_clarification / frozen / issued) for
-- BOTH feeds. On the PUBLIC feed (verify.sarh.ly) that leaks: an approved
-- parcel overlapping an UNAPPROVED one is painted red with the popup
-- "overlaps an unapproved parcel" to anonymous visitors — revealing the
-- existence of a non-public pending claim, which the public feed is supposed to
-- never disclose (MapService: "deed-issued parcels only").
--
-- Fix: scope the overlap target set by @p_public.
--   • Public feed  (@p_public = 1): conflicts consider only OTHER ISSUED parcels
--     (approved/minted/transferred). Overlap with a pending parcel is invisible
--     publicly → conflict_kind is only 'ownership_conflict' or 'none';
--     'location_conflict' (pending overlap) is NEVER surfaced publicly.
--   • Officer feed (@p_public = 0): unchanged — considers all live parcels.
-- Columns, map_status and the row WHERE are otherwise identical to 046.
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
        -- Boolean: any real-area overlap with a parcel the VIEWER may see. A
        -- public viewer only "sees" issued parcels, so a public parcel's overlap
        -- with a pending one is NOT a public conflict.
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
        -- Derived KIND. ownership_conflict (overlap with an ISSUED parcel) is
        -- shown to everyone. location_conflict (overlap with a PENDING parcel)
        -- is OFFICER-ONLY — never revealed on the public feed.
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

PRINT N'047_public_map_conflict_scope.sql applied.';
GO
