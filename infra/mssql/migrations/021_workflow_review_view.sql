-- =========================================================================
-- 021_workflow_review_view.sql — single-row property load for officer review.
-- Ports the original RPC; SQL Server returns a result-set from a stored proc.
-- =========================================================================
USE [sijilli];
GO

CREATE OR ALTER PROCEDURE dbo.property_review_view
    @p_property_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.id,
        p.property_code,
        p.status,
        p.region_id,
        p.property_type,
        p.area_sqm,
        p.address_ar,
        p.parcel_number,
        p.owner_citizen_id,
        -- ST_AsGeoJSON -> .AsGml() returns GML, not GeoJSON. We synthesize a
        -- minimal GeoJSON-Polygon string from the polygon's WKT. Callers
        -- only need the coordinates to render on the reviewer map.
        CASE
            WHEN p.boundary_polygon IS NULL THEN NULL
            ELSE dbo.fn_polygon_to_geojson(p.boundary_polygon)
        END AS boundary_polygon_geojson
    FROM properties p
    WHERE p.id = @p_property_id;
END
GO

-- Helper: WKT POLYGON((lng lat, lng lat, ...)) -> GeoJSON Polygon.
CREATE OR ALTER FUNCTION dbo.fn_polygon_to_geojson(@poly geography)
RETURNS NVARCHAR(MAX)
AS
BEGIN
    IF @poly IS NULL RETURN NULL;

    DECLARE @wkt NVARCHAR(MAX) = @poly.STAsText();
    -- Strip the WKT header/parens.
    DECLARE @inside NVARCHAR(MAX) = REPLACE(REPLACE(REPLACE(@wkt,
        N'POLYGON ((', N''), N'))', N''), N',  ', N',');
    -- Split coordinates and rebuild as JSON array of [lng,lat].
    DECLARE @arr NVARCHAR(MAX) = N'[';
    DECLARE @first BIT = 1;
    DECLARE @pos INT = 1, @nextPos INT;
    DECLARE @pair NVARCHAR(64);

    WHILE 1 = 1
    BEGIN
        SET @nextPos = CHARINDEX(N',', @inside, @pos);
        IF @nextPos = 0
            SET @pair = LTRIM(RTRIM(SUBSTRING(@inside, @pos, LEN(@inside) - @pos + 1)));
        ELSE
            SET @pair = LTRIM(RTRIM(SUBSTRING(@inside, @pos, @nextPos - @pos)));

        DECLARE @sp INT = CHARINDEX(N' ', @pair);
        IF @sp > 0
        BEGIN
            IF @first = 0 SET @arr += N',';
            SET @arr += N'[' + LEFT(@pair, @sp - 1) + N','
                       + SUBSTRING(@pair, @sp + 1, LEN(@pair) - @sp) + N']';
            SET @first = 0;
        END

        IF @nextPos = 0 BREAK;
        SET @pos = @nextPos + 1;
    END

    RETURN N'{"type":"Polygon","coordinates":[' + @arr + N']]}';
END
GO
