-- =========================================================================
-- 045_property_location_conflict.sql — derived "location conflict" flag
-- =========================================================================
-- Anti-fraud: a land sold twice (or a boundary that overlaps an already
-- registered parcel) must be visible to the reviewer. CLAUDE.md constraint #3
-- forbids a HARD block on overlap (legacy paper deeds legitimately conflict),
-- so this is a DERIVED warning — never a stored column that can drift — exactly
-- like map_status / has_active_dispute in 043_property_map.sql.
--
-- A parcel "has a location conflict" when its polygon overlaps ANOTHER live
-- parcel's polygon by a real AREA, not just a shared edge. We measure the
-- intersection area (m²) and require it to exceed @min_overlap_sqm:
--   • Adjacent parcels that share a boundary LINE intersect with area = 0  → NOT a conflict.
--   • A parcel drawn on top of a registered one (double-sell) overlaps by a
--     large area                                                          → conflict.
-- 1 m² is a deliberate floor that ignores floating-point slivers at borders
-- while still catching a genuine overlap of "centimeters" along a long edge.
--
-- This file:
--   1. dbo.fn_property_has_location_conflict(@id) — reusable scalar flag.
--   2. dbo.find_property_location_conflicts(@id)  — the overlapping parcels
--      (code + parcel no + overlap %) for the officer review banner.
--   3. CREATE OR ALTER dbo.property_map_features — adds has_location_conflict
--      to the bulk map feed so the officer/public maps can paint it.
-- =========================================================================
USE [sarh];
GO

-- Minimum real overlap (m²) that counts as a conflict. Inlined as a literal
-- in each object below; documented here as the single source of the rule.
-- (SQL Server has no cross-object constants, so keep these in sync: 1.0)

-- -------------------------------------------------------------------------
-- 1) Scalar flag: does parcel @id overlap any OTHER live parcel by area?
-- -------------------------------------------------------------------------
CREATE OR ALTER FUNCTION dbo.fn_property_has_location_conflict(@id UNIQUEIDENTIFIER)
RETURNS BIT
AS
BEGIN
    DECLARE @poly geography = (SELECT boundary_polygon FROM properties WHERE id = @id);
    IF @poly IS NULL RETURN 0;

    DECLARE @hit BIT = 0;
    IF EXISTS (
        SELECT 1
        FROM properties q
        WHERE q.id <> @id
          AND q.boundary_polygon IS NOT NULL
          AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                           N'approved', N'minted', N'transferred', N'frozen')
          AND @poly.STIntersects(q.boundary_polygon) = 1
          AND @poly.STIntersection(q.boundary_polygon).STArea() > 1.0
    )
        SET @hit = 1;

    RETURN @hit;
END
GO

-- -------------------------------------------------------------------------
-- 2) List the conflicting parcels for one property (review banner + detail).
--    overlap_pct is the intersection area as a % of THIS parcel's area.
-- -------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.find_property_location_conflicts
    @p_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @poly geography = (SELECT boundary_polygon FROM properties WHERE id = @p_id);
    IF @poly IS NULL RETURN;

    SELECT
        q.id            AS property_id,
        q.property_code,
        q.parcel_number,
        q.status,
        ROUND(
            CAST(@poly.STIntersection(q.boundary_polygon).STArea() AS DECIMAL(18,6))
          / NULLIF(CAST(@poly.STArea() AS DECIMAL(18,6)), 0) * 100.0, 2
        ) AS overlap_pct
    FROM properties q
    WHERE q.id <> @p_id
      AND q.boundary_polygon IS NOT NULL
      AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                       N'approved', N'minted', N'transferred', N'frozen')
      AND @poly.STIntersects(q.boundary_polygon) = 1
      AND @poly.STIntersection(q.boundary_polygon).STArea() > 1.0
    ORDER BY overlap_pct DESC;
END
GO

-- -------------------------------------------------------------------------
-- 3) Add has_location_conflict to the bulk map feed (officer + public maps).
--    Re-declares the proc verbatim from 043 plus the new derived column so the
--    map can outline a conflicting parcel distinctly. Conflict is INDEPENDENT
--    of map_status (a parcel can be 'clear' yet still overlap another) — the
--    client paints it as a separate red hatch / badge.
-- -------------------------------------------------------------------------
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
        -- Derived overlap flag. EXISTS short-circuits on the cheap STIntersects
        -- before measuring intersection area, so adjacency (area 0) is ignored.
        CASE WHEN EXISTS (
            SELECT 1 FROM properties q
            WHERE q.id <> p.id
              AND q.boundary_polygon IS NOT NULL
              AND q.status IN (N'pending', N'under_review', N'needs_clarification',
                               N'approved', N'minted', N'transferred', N'frozen')
              AND p.boundary_polygon.STIntersects(q.boundary_polygon) = 1
              AND p.boundary_polygon.STIntersection(q.boundary_polygon).STArea() > 1.0
        ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS has_location_conflict,
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

PRINT N'045_property_location_conflict.sql applied.';
GO
