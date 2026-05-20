-- =========================================================================
-- 036_citizens_filtered_unique.sql — fix false-conflict on citizen create.
--
-- Migration 003 declared legacy_national_no/phone/email as NULL UNIQUE.
-- SQL Server treats NULL as a value in a UNIQUE constraint, so two
-- citizens with NULL legacy_national_no (or NULL phone, or NULL email)
-- collide on insert. This blocks legitimate creates from POST /citizens
-- when a caller omits any of those optional fields.
--
-- The fix: drop the table-level UNIQUE constraints and replace with
-- filtered unique indexes that only enforce uniqueness on non-null values.
-- That is the recommended SQL Server pattern for "nullable unique" columns.
--
-- Idempotent — re-running is a no-op once the filtered indexes exist.
-- =========================================================================
USE [sarh];
GO

-- Filtered indexes require QUOTED_IDENTIFIER ON / ANSI_NULLS ON.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- legacy_national_no
DECLARE @sql NVARCHAR(MAX);
SELECT @sql = N'ALTER TABLE citizens DROP CONSTRAINT ' + QUOTENAME(kc.name) + ';'
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.citizens')
  AND kc.type = 'UQ'
  AND c.name = 'legacy_national_no';
IF @sql IS NOT NULL EXEC sp_executesql @sql;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_citizens_legacy_national_no' AND object_id = OBJECT_ID('dbo.citizens'))
BEGIN
    CREATE UNIQUE INDEX ux_citizens_legacy_national_no
        ON citizens(legacy_national_no)
        WHERE legacy_national_no IS NOT NULL;
END
GO

-- phone
DECLARE @sql NVARCHAR(MAX);
SELECT @sql = N'ALTER TABLE citizens DROP CONSTRAINT ' + QUOTENAME(kc.name) + ';'
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.citizens')
  AND kc.type = 'UQ'
  AND c.name = 'phone';
IF @sql IS NOT NULL EXEC sp_executesql @sql;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_citizens_phone' AND object_id = OBJECT_ID('dbo.citizens'))
BEGIN
    CREATE UNIQUE INDEX ux_citizens_phone
        ON citizens(phone)
        WHERE phone IS NOT NULL;
END
GO

-- email
DECLARE @sql NVARCHAR(MAX);
SELECT @sql = N'ALTER TABLE citizens DROP CONSTRAINT ' + QUOTENAME(kc.name) + ';'
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.citizens')
  AND kc.type = 'UQ'
  AND c.name = 'email';
IF @sql IS NOT NULL EXEC sp_executesql @sql;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_citizens_email' AND object_id = OBJECT_ID('dbo.citizens'))
BEGIN
    CREATE UNIQUE INDEX ux_citizens_email
        ON citizens(email)
        WHERE email IS NOT NULL;
END
GO
