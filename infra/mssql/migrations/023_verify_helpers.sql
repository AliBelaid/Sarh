-- =========================================================================
-- 023_verify_helpers.sql — public verify endpoint helper
-- =========================================================================
USE [sarh];
GO

CREATE OR ALTER PROCEDURE dbo.property_polygon_geojson
    @p_property_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CASE
               WHEN boundary_polygon IS NULL THEN NULL
               ELSE dbo.fn_polygon_to_geojson(boundary_polygon)
           END AS geojson
    FROM   properties
    WHERE  id = @p_property_id
      AND  status = N'approved';
END
GO
