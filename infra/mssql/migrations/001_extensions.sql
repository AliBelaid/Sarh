-- =========================================================================
-- 001_extensions.sql — SQL Server has no extensions. We enable the features
-- that the Postgres extensions provided:
--   uuid-ossp / pgcrypto  -> NEWID() / CRYPT_GEN_RANDOM are built-in
--   postgis               -> the `geography` type is built-in
--   pg_trgm               -> fulltext catalog (Arabic word breaker)
--   btree_gist            -> N/A (covered by composite + filtered indexes)
-- =========================================================================
USE [sarh];
GO

-- Fulltext catalog used by 003_citizens.sql for Arabic name search.
-- Wrapped in a try-style check because some SQL Server SKUs (e.g. Express
-- without the FullText feature installed) don't ship full-text search.
-- We log + continue rather than fail the migration; queries that depend
-- on the catalog are limited to the citizens search box.
IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'sarh_ft')
BEGIN
    BEGIN TRY
        EXEC(N'CREATE FULLTEXT CATALOG sarh_ft AS DEFAULT;');
    END TRY
    BEGIN CATCH
        PRINT N'WARNING: full-text catalog skipped — ' + ERROR_MESSAGE();
    END CATCH
END
GO

-- (NEWID() is intrinsic to SQL Server; no extension needed. The original
-- Postgres migrations called uuid_generate_v4() — every column default in
-- the SQL Server port now uses NEWID() directly.)
GO
