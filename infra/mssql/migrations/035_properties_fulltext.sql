-- =========================================================================
-- 035_properties_fulltext.sql — Full-text index on properties for Arabic
-- address search and property code lookup.
-- =========================================================================
USE [sarh];
GO

-- Unique index required for the full-text key.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_properties_id_for_ft' AND object_id = OBJECT_ID(N'properties'))
    CREATE UNIQUE INDEX ux_properties_id_for_ft ON properties(id);
GO

-- Full-text index: address_ar (Arabic 1025) + property_code (neutral 0).
-- Wrapped in try-catch for SQL Server editions without FullText feature.
IF EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'sarh_ft')
BEGIN
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'properties'))
            EXEC(N'CREATE FULLTEXT INDEX ON properties(address_ar LANGUAGE 1025, property_code LANGUAGE 0)
                  KEY INDEX ux_properties_id_for_ft
                  ON sarh_ft
                  WITH CHANGE_TRACKING AUTO;');
    END TRY
    BEGIN CATCH
        PRINT N'WARNING: properties full-text index skipped — ' + ERROR_MESSAGE();
    END CATCH
END
GO
