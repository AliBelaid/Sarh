-- =========================================================================
-- 039_documented_area.sql — "area per the paper deed" cross-check column
-- =========================================================================
-- The authoritative area is always computed from the boundary polygon (the
-- shape the citizen drew or walked). This nullable column records the area
-- stated on the *paper* deed/papers so a reviewer can cross-check it against
-- the measured area. A discrepancy is surfaced as a reviewer warning, never
-- a hard block — legacy paper measurements are often imprecise.
USE [sarh];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.properties') AND name = N'documented_area_sqm')
BEGIN
    ALTER TABLE properties
        ADD documented_area_sqm DECIMAL(14,2) NULL
            CONSTRAINT ck_properties_documented_area_positive
            CHECK (documented_area_sqm IS NULL OR documented_area_sqm > 0);
END
GO
