-- =========================================================================
-- 030_app_user_grant.sql — bind the sarh_app login to the sarh database.
--
-- run-migrations.ps1 drops and recreates the sarh database on -Reset, but
-- the server-level login `sarh_app` lives in master and survives the drop.
-- After CREATE DATABASE the new sarh DB has no user mapped to that login,
-- so the API gets "Login failed" even though the credentials are correct.
--
-- This migration is idempotent: it creates the DB user + role grant if
-- missing, and re-syncs the SID if the login was recreated separately.
--
-- The login itself is NOT created here — bootstrap-login.sql does that
-- one-off for fresh machines (run with Windows auth).
-- =========================================================================
USE [sarh];
GO

IF SUSER_ID(N'sarh_app') IS NULL
BEGIN
    RAISERROR(
        N'Login [sarh_app] does not exist. Run bootstrap-login.sql once with Windows auth before db:reset.',
        16, 1);
END
GO

IF DATABASE_PRINCIPAL_ID(N'sarh_app') IS NULL
BEGIN
    CREATE USER [sarh_app] FOR LOGIN [sarh_app];
END
ELSE
BEGIN
    -- Re-sync orphaned user (login SID changed since DB was created).
    ALTER USER [sarh_app] WITH LOGIN = [sarh_app];
END
GO

ALTER ROLE db_datareader ADD MEMBER [sarh_app];
ALTER ROLE db_datawriter ADD MEMBER [sarh_app];
ALTER ROLE db_ddladmin   ADD MEMBER [sarh_app];
GO

GRANT EXECUTE TO [sarh_app];
GO
