-- =========================================================================
-- 019_properties_helpers.sql — submission helpers
-- =========================================================================
USE [sarh];
GO

-- Sequential per-year request numbers (REQ-YYYY-000001, ...).
CREATE TABLE request_no_seq (
    [year]  INT NOT NULL PRIMARY KEY,
    last_no INT NOT NULL DEFAULT 0
);
GO

CREATE OR ALTER PROCEDURE dbo.next_registration_request_no
    @p_year   INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @no INT;
    DECLARE @result NVARCHAR(20);

    -- MERGE is the SQL Server "upsert + RETURNING" idiom.
    DECLARE @out TABLE (last_no INT);
    MERGE request_no_seq WITH (HOLDLOCK) AS tgt
    USING (SELECT @p_year AS y) AS src
       ON tgt.[year] = src.y
    WHEN MATCHED THEN
        UPDATE SET last_no = tgt.last_no + 1
    WHEN NOT MATCHED THEN
        INSERT ([year], last_no) VALUES (src.y, 1)
    OUTPUT inserted.last_no INTO @out;

    SELECT @no = last_no FROM @out;
    SET @result = N'REQ-' + CAST(@p_year AS NVARCHAR(8))
                  + N'-' + RIGHT(N'000000' + CAST(@no AS NVARCHAR(8)), 6);
    -- Single-column SELECT so the API's .rpc() shim returns a scalar.
    SELECT @result AS request_no;
END
GO

-- Submission validator. Computes computed_area_sqm, area_diff_pct, and
-- whether an APPROVED property already shares the same centroid.
--
-- Note: PostGIS used ST_Transform to EPSG:32633 (UTM zone 33N) for an
-- accurate metric area. SQL Server's `geography` works directly on the
-- spheroid, so .STArea() already returns square metres.
CREATE OR ALTER PROCEDURE dbo.validate_property_submission
    @p_polygon  geography,
    @p_area_sqm DECIMAL(14,2)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @computed DECIMAL(14,2) = CAST(@p_polygon.STArea() AS DECIMAL(14,2));
    DECLARE @diff_pct DECIMAL(7,2) = CASE
        WHEN @p_area_sqm IS NULL OR @p_area_sqm = 0 THEN NULL
        ELSE CAST(ABS(@computed - @p_area_sqm) / @p_area_sqm * 100 AS DECIMAL(7,2))
    END;

    DECLARE @centroid          geography      = @p_polygon.EnvelopeCenter();
    DECLARE @match_id          UNIQUEIDENTIFIER;
    DECLARE @match_code        NVARCHAR(32);

    SELECT TOP (1)
           @match_id   = p.id,
           @match_code = p.property_code
    FROM   properties p
    WHERE  p.status = N'approved'
      AND  p.location_point IS NOT NULL
      AND  p.location_point.STEquals(@centroid) = 1;

    SELECT
        @computed                                AS computed_area_sqm,
        @diff_pct                                AS area_diff_pct,
        CASE WHEN @match_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END
                                                 AS has_approved_centroid_match,
        @match_id                                AS matched_centroid_property_id,
        @match_code                              AS matched_centroid_property_code;
END
GO

-- AFTER INSERT/UPDATE trigger that:
--   1. Auto-fills location_point from boundary_polygon's envelope centre
--      when the API didn't set it.
--   2. Stamps location_point_wkt (the indexable, fixed-precision lon,lat
--      copy used by the "no two approved properties at identical centroid"
--      unique filtered index from 006_properties.sql).
CREATE OR ALTER TRIGGER tr_properties_set_centroid
ON properties
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Set centroid from polygon when the row doesn't already have one.
    UPDATE p
    SET    location_point = i.boundary_polygon.EnvelopeCenter()
    FROM   properties p
    INNER JOIN inserted i ON i.id = p.id
    WHERE  i.boundary_polygon IS NOT NULL
      AND  p.location_point IS NULL;

    -- Refresh the WKT copy whenever location_point changes.
    UPDATE p
    SET    location_point_wkt = CONCAT(
               CAST(ROUND(p.location_point.Long, 7) AS NVARCHAR(20)),
               N',',
               CAST(ROUND(p.location_point.Lat , 7) AS NVARCHAR(20))
           )
    FROM   properties p
    INNER JOIN inserted i ON i.id = p.id
    WHERE  p.location_point IS NOT NULL;
END
GO

-- Insert helper used by the API. Polygon comes in as GeoJSON text.
CREATE OR ALTER PROCEDURE dbo.insert_property_with_polygon
    @p_owner_citizen_id UNIQUEIDENTIFIER,
    @p_property_type    NVARCHAR(16),
    @p_region_id        INT,
    @p_municipality_id  INT,
    @p_address_ar       NVARCHAR(MAX),
    @p_parcel_number    NVARCHAR(32),
    @p_plan_number      NVARCHAR(32),
    @p_block_number     NVARCHAR(32),
    @p_polygon          NVARCHAR(MAX),    -- alias of geojson, matches caller's `p_polygon`
    @p_area_sqm         DECIMAL(14,2),
    @p_length_m         DECIMAL(10,2),
    @p_width_m          DECIMAL(10,2),
    @p_depth_m          DECIMAL(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @new_id UNIQUEIDENTIFIER = NEWID();
    DECLARE @p_polygon_geojson NVARCHAR(MAX) = @p_polygon;

    -- GeoJSON -> geography. SQL Server has no built-in GeoJSON parser, so
    -- the caller must convert to WKT first via dbo.fn_geojson_polygon_to_wkt
    -- (defined below). We keep the proc signature stable by accepting
    -- either WKT (starts with 'POLYGON') or GeoJSON.
    DECLARE @poly geography;
    IF LEFT(LTRIM(@p_polygon_geojson), 7) = N'POLYGON'
        SET @poly = geography::STGeomFromText(@p_polygon_geojson, 4326);
    ELSE
        SET @poly = geography::STGeomFromText(
            dbo.fn_geojson_polygon_to_wkt(@p_polygon_geojson), 4326);

    INSERT INTO properties (
        id, owner_citizen_id, property_type,
        region_id, municipality_id, address_ar,
        parcel_number, plan_number, block_number,
        boundary_polygon,
        area_sqm, length_m, width_m, depth_m,
        status, submitted_at
    )
    VALUES (
        @new_id, @p_owner_citizen_id, @p_property_type,
        @p_region_id, @p_municipality_id, @p_address_ar,
        @p_parcel_number, @p_plan_number, @p_block_number,
        @poly,
        @p_area_sqm, @p_length_m, @p_width_m, @p_depth_m,
        N'pending', SYSDATETIMEOFFSET()
    );

    -- Scalar return for the API's .rpc() shim.
    SELECT @new_id AS id;
END
GO

-- Tiny GeoJSON-Polygon-to-WKT converter. Handles only the shape Sarh
-- emits: { "type":"Polygon", "coordinates": [ [ [lng,lat], ... ] ] }.
-- Anything more elaborate should be converted client-side.
CREATE OR ALTER FUNCTION dbo.fn_geojson_polygon_to_wkt(@geojson NVARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    -- Fast path: parse the first ring of coordinates.
    DECLARE @ring NVARCHAR(MAX);
    SET @ring = JSON_QUERY(@geojson, N'$.coordinates[0]');
    IF @ring IS NULL RETURN NULL;

    DECLARE @wkt NVARCHAR(MAX) = N'POLYGON((';
    DECLARE @first BIT = 1;

    DECLARE coord_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT JSON_VALUE([value], N'$[0]') + N' ' + JSON_VALUE([value], N'$[1]')
        FROM OPENJSON(@ring);

    DECLARE @pt NVARCHAR(64);
    OPEN coord_cursor;
    FETCH NEXT FROM coord_cursor INTO @pt;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        IF @first = 0 SET @wkt += N', ';
        SET @wkt += @pt;
        SET @first = 0;
        FETCH NEXT FROM coord_cursor INTO @pt;
    END
    CLOSE coord_cursor;
    DEALLOCATE coord_cursor;

    RETURN @wkt + N'))';
END
GO

-- Spatial nearest-neighbour query. SQL Server doesn't have <-> the way
-- PostGIS does, but spatial indexes accelerate STDistance() with the
-- nearest-neighbour pattern.
CREATE OR ALTER PROCEDURE dbo.properties_nearby
    @p_point_wkt NVARCHAR(200),
    @p_radius_m  DECIMAL(12,2),
    @p_limit     INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @origin geography = geography::STGeomFromText(@p_point_wkt, 4326);

    SELECT TOP (@p_limit)
        p.id,
        p.property_code,
        p.parcel_number,
        p.property_type,
        p.status,
        p.area_sqm,
        ROUND(CAST(p.location_point.STDistance(@origin) AS DECIMAL(12,2)), 2) AS distance_m
    FROM properties p
    WHERE p.location_point IS NOT NULL
      AND p.location_point.STDistance(@origin) <= @p_radius_m
    ORDER BY p.location_point.STDistance(@origin) ASC;
END
GO
