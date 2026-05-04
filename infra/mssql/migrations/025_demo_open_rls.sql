-- =========================================================================
-- 025_demo_open_rls.sql — Postgres-only migration; not needed on SQL Server.
--
-- The original opened RLS for the demo flow. SQL Server replaces RLS with
-- NestJS guards (the API connects as a privileged user), so the demo flow
-- is automatically permitted without any policy changes.
--
-- Kept as an empty placeholder so the migration numbering matches the
-- Postgres history and `docs/migrations.md` cross-references still work.
-- =========================================================================
USE [sijilli];
GO

-- Add the optional auth_user_id linkage on citizens that the demo path
-- expects. We didn't add it to 003_citizens.sql because it isn't needed
-- for the registry flow itself.
IF COL_LENGTH(N'citizens', N'auth_user_id') IS NULL
BEGIN
    ALTER TABLE citizens ADD auth_user_id UNIQUEIDENTIFIER NULL;
    EXEC(N'CREATE INDEX idx_citizens_auth_user_id ON citizens(auth_user_id);');
END
GO
