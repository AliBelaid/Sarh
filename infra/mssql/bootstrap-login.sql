-- =========================================================================
-- bootstrap-login.sql — one-off login creation for the Sarh dev DB.
--
-- Run this ONCE with Windows auth (sysadmin) on a fresh machine before
-- the first db:reset:
--
--   sqlcmd -S localhost -E -i infra/mssql/bootstrap-login.sql
--
-- Idempotent: it only creates the login if missing, and it does NOT touch
-- the database — that's owned by the migration runner.
-- =========================================================================
USE [master];
GO

IF SUSER_ID(N'sarh_app') IS NULL
BEGIN
    CREATE LOGIN [sarh_app]
        WITH PASSWORD     = N'SarhDevPwd!2026',
             CHECK_POLICY = OFF,
             DEFAULT_DATABASE = [master];
END
GO
