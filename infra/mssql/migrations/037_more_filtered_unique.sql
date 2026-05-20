-- =========================================================================
-- 037_more_filtered_unique.sql — extend 036 to digital_id_cards, officers,
-- and properties.
--
-- Same defect as 036: NULL UNIQUE columns collide on the second NULL.
-- Replace each with a filtered unique index.
--
-- Tables fixed here:
--   * digital_id_cards.nfc_uid  (collided on second issuance)
--   * digital_id_cards.did      (placeholder DIDs)
--   * officers.auth_user_id     (officers without an auth_user link)
--   * properties.property_code  (drafts before code assignment)
--
-- Idempotent — re-running is a no-op.
-- =========================================================================
USE [sarh];
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo._drop_unique_on_column
    @table SYSNAME, @column SYSNAME
AS
BEGIN
    DECLARE @sql NVARCHAR(MAX);
    SELECT @sql = N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
               + N' DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';'
    FROM sys.key_constraints kc
    JOIN sys.tables t ON t.object_id = kc.parent_object_id
    JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE t.name = @table AND c.name = @column AND kc.type = 'UQ';
    IF @sql IS NOT NULL EXEC sp_executesql @sql;
END
GO

EXEC dbo._drop_unique_on_column 'digital_id_cards', 'nfc_uid';
EXEC dbo._drop_unique_on_column 'digital_id_cards', 'did';
EXEC dbo._drop_unique_on_column 'officers',         'auth_user_id';
EXEC dbo._drop_unique_on_column 'properties',       'property_code';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_did_cards_nfc_uid' AND object_id = OBJECT_ID('dbo.digital_id_cards'))
    CREATE UNIQUE INDEX ux_did_cards_nfc_uid ON digital_id_cards(nfc_uid) WHERE nfc_uid IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_did_cards_did' AND object_id = OBJECT_ID('dbo.digital_id_cards'))
    CREATE UNIQUE INDEX ux_did_cards_did ON digital_id_cards(did) WHERE did IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_officers_auth_user_id' AND object_id = OBJECT_ID('dbo.officers'))
    CREATE UNIQUE INDEX ux_officers_auth_user_id ON officers(auth_user_id) WHERE auth_user_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_properties_property_code' AND object_id = OBJECT_ID('dbo.properties'))
    CREATE UNIQUE INDEX ux_properties_property_code ON properties(property_code) WHERE property_code IS NOT NULL;
GO

DROP PROCEDURE dbo._drop_unique_on_column;
GO
