-- =========================================================================
-- 000_database.sql — create the Sijilli SQL Server database (run once).
-- Equivalent of `supabase db reset` setup, except for the catalog itself.
-- =========================================================================
IF DB_ID(N'sijilli') IS NULL
BEGIN
    CREATE DATABASE [sijilli]
        COLLATE Arabic_CI_AS;
END
GO

ALTER DATABASE [sijilli] SET RECOVERY SIMPLE;
ALTER DATABASE [sijilli] SET ANSI_NULL_DEFAULT ON;
ALTER DATABASE [sijilli] SET QUOTED_IDENTIFIER ON;
GO

USE [sijilli];
GO

IF SCHEMA_ID(N'sijilli') IS NULL
    EXEC(N'CREATE SCHEMA [sijilli]');
GO
