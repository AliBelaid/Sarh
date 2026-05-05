-- =========================================================================
-- 000_database.sql — create the Sarh SQL Server database (run once).
-- Equivalent of `supabase db reset` setup, except for the catalog itself.
-- =========================================================================
IF DB_ID(N'sarh') IS NULL
BEGIN
    CREATE DATABASE [sarh]
        COLLATE Arabic_CI_AS;
END
GO

ALTER DATABASE [sarh] SET RECOVERY SIMPLE;
ALTER DATABASE [sarh] SET ANSI_NULL_DEFAULT ON;
ALTER DATABASE [sarh] SET QUOTED_IDENTIFIER ON;
GO

USE [sarh];
GO

IF SCHEMA_ID(N'sarh') IS NULL
    EXEC(N'CREATE SCHEMA [sarh]');
GO
