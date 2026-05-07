-- =========================================================================
-- 027_fix_property_triggers.sql — eliminate trigger-recursion ping-pong on
-- the properties table.
--
-- Background: the AFTER INSERT/UPDATE trigger tr_properties_set_centroid
-- updates the same row to populate location_point + location_point_wkt.
-- That UPDATE fires tr_properties_updated_at, which UPDATEs again to bump
-- updated_at, which re-fires the centroid trigger's AFTER UPDATE branch,
-- and so on until SQL Server's 32-level nesting cap (error 217).
--
-- Fix: bail out of both triggers early when there's nothing left to do.
-- TRIGGER_NESTLEVEL() guard is the canonical SQL Server idiom for this.
-- =========================================================================
USE [sarh];
GO

-- Spatial-index operations inside the trigger body require QUOTED_IDENTIFIER ON
-- *at the moment the trigger was compiled*. sqlcmd defaults to OFF; we flip it
-- on for this migration so the trigger captures the right SET options.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER TRIGGER tr_properties_set_centroid
ON properties
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Bail when the trigger is firing because of an UPDATE we just issued
    -- ourselves (or from tr_properties_updated_at). Without this guard the
    -- two triggers ping-pong up to nesting limit 32.
    IF TRIGGER_NESTLEVEL(OBJECT_ID('tr_properties_set_centroid')) > 1 RETURN;
    IF TRIGGER_NESTLEVEL(OBJECT_ID('tr_properties_updated_at'))   > 0 RETURN;

    UPDATE p
    SET    location_point = i.boundary_polygon.EnvelopeCenter()
    FROM   properties p
    INNER JOIN inserted i ON i.id = p.id
    WHERE  i.boundary_polygon IS NOT NULL
      AND  p.location_point IS NULL;

    UPDATE p
    SET    location_point_wkt = CONCAT(
               CAST(ROUND(p.location_point.Long, 7) AS NVARCHAR(20)),
               N',',
               CAST(ROUND(p.location_point.Lat , 7) AS NVARCHAR(20))
           )
    FROM   properties p
    INNER JOIN inserted i ON i.id = p.id
    WHERE  p.location_point IS NOT NULL
      AND  (p.location_point_wkt IS NULL
            OR p.location_point_wkt <> CONCAT(
                CAST(ROUND(p.location_point.Long, 7) AS NVARCHAR(20)),
                N',',
                CAST(ROUND(p.location_point.Lat , 7) AS NVARCHAR(20))
            ));
END
GO

CREATE OR ALTER TRIGGER tr_properties_updated_at
ON properties
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Skip when the row's UPDATE was already part of an updated_at bump
    -- or from the centroid trigger.
    IF UPDATE(updated_at) RETURN;
    IF TRIGGER_NESTLEVEL(OBJECT_ID('tr_properties_updated_at'))   > 1 RETURN;
    IF TRIGGER_NESTLEVEL(OBJECT_ID('tr_properties_set_centroid')) > 0 RETURN;

    UPDATE p
    SET    updated_at = SYSDATETIMEOFFSET()
    FROM   properties p
    INNER JOIN inserted i ON i.id = p.id;
END
GO
