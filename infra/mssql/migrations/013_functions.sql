-- =========================================================================
-- 013_functions.sql — domain functions (digital ID generation, overlap check)
-- =========================================================================
USE [sijilli];
GO

-- Auto-generate digital ID number with Luhn-style check.
-- Format: LY-RR-YYYY-SSSSSS-C
CREATE OR ALTER FUNCTION dbo.generate_digital_id (
    @p_region_code NVARCHAR(4),
    @p_year        INT
)
RETURNS NVARCHAR(24)
AS
BEGIN
    DECLARE @v_serial INT;
    DECLARE @v_base   NVARCHAR(64);
    DECLARE @v_check  INT;
    DECLARE @prefix   NVARCHAR(32) = N'LY-' + @p_region_code + N'-' + CAST(@p_year AS NVARCHAR(8)) + N'-';

    SELECT @v_serial = ISNULL(MAX(TRY_CAST(SUBSTRING(digital_id_number, 12, 6) AS INT)), 0) + 1
    FROM digital_id_cards
    WHERE digital_id_number LIKE @prefix + N'%';

    SET @v_base  = N'LY' + @p_region_code + CAST(@p_year AS NVARCHAR(8))
                   + RIGHT(N'000000' + CAST(@v_serial AS NVARCHAR(8)), 6);
    SET @v_check = (LEN(@v_base) * 7) % 10;

    RETURN @prefix
         + RIGHT(N'000000' + CAST(@v_serial AS NVARCHAR(8)), 6)
         + N'-' + CAST(@v_check AS NVARCHAR(2));
END
GO

-- Detect overlapping property polygons for reviewer warnings.
-- Returns approved properties whose boundary intersects @p_polygon, with
-- the overlap percentage relative to @p_polygon's area.
--
-- Exposed as a stored proc rather than a TVF because geography methods are
-- not allowed in inline TVFs (CLR call) and a multi-statement TVF would lose
-- spatial-index pushdown. Callers SELECT against this proc via
-- INSERT INTO #tmp EXEC ... or by using a temp table fanout.
CREATE OR ALTER PROCEDURE dbo.find_property_overlaps
    @p_polygon geography
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.id          AS property_id,
        p.parcel_number,
        ROUND(
            CAST(p.boundary_polygon.STIntersection(@p_polygon).STArea() AS DECIMAL(18,6))
          / NULLIF(CAST(@p_polygon.STArea() AS DECIMAL(18,6)), 0)
          * 100.0, 2
        ) AS overlap_pct
    FROM properties p
    WHERE p.boundary_polygon IS NOT NULL
      AND p.status = N'approved'
      AND p.boundary_polygon.STIntersects(@p_polygon) = 1;
END
GO
