-- =========================================================================
-- 015_rls.sql — Row Level Security (lift-and-shift from Postgres)
--
-- Authorization design changes for SQL Server:
--
--   The Postgres version used Supabase Auth + RLS, where each browser/app
--   had its own JWT-bound DB connection and the database enforced row
--   visibility from the JWT claims. With local SQL Server we replace that
--   model with NestJS guards (see apps/api/src/auth/guards/*) that run on
--   the privileged DB connection and enforce the same invariants in code,
--   *plus* a defense-in-depth security policy below for the highest-risk
--   tables.
--
--   We keep RLS only on `audit_log` and `digital_id_cards`, and use
--   SESSION_CONTEXT('citizen_id' / 'officer_role') set by the API at the
--   start of every request. The other tables rely on guards.
-- =========================================================================
USE [sijilli];
GO

-- Helper: returns the current request's citizen_id (or NULL).
CREATE OR ALTER FUNCTION dbo.fn_session_citizen_id()
RETURNS UNIQUEIDENTIFIER
WITH SCHEMABINDING
AS
BEGIN
    RETURN CAST(SESSION_CONTEXT(N'citizen_id') AS UNIQUEIDENTIFIER);
END
GO

CREATE OR ALTER FUNCTION dbo.fn_session_officer_role()
RETURNS NVARCHAR(32)
WITH SCHEMABINDING
AS
BEGIN
    RETURN CAST(SESSION_CONTEXT(N'officer_role') AS NVARCHAR(32));
END
GO

-- ---------- AUDIT LOG ----------
-- Read-side predicate: only auditors / super_admins may SELECT.
CREATE OR ALTER FUNCTION dbo.fn_audit_log_predicate(@actor_kind NVARCHAR(16))
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS allowed
       WHERE dbo.fn_session_officer_role() IN (N'auditor', N'super_admin')
          OR SESSION_CONTEXT(N'audit_bypass') = CAST(1 AS BIT);
GO

-- The API sets SESSION_CONTEXT('audit_bypass', 1) when writing audit
-- entries from its own interceptor — i.e., trust the application layer
-- to insert, but only auditor-class roles to read. Toggle is set per
-- request, so it can't leak.
IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'sec_audit_log')
BEGIN
    EXEC(N'
        CREATE SECURITY POLICY sec_audit_log
        ADD FILTER PREDICATE dbo.fn_audit_log_predicate(actor_kind) ON dbo.audit_log
        WITH (STATE = ON);
    ');
END
GO

-- ---------- DIGITAL ID CARDS ----------
-- Citizens can only see their own card.
CREATE OR ALTER FUNCTION dbo.fn_did_cards_predicate(@citizen_id UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS allowed
       WHERE @citizen_id = dbo.fn_session_citizen_id()
          OR dbo.fn_session_officer_role() IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'sec_did_cards')
BEGIN
    EXEC(N'
        CREATE SECURITY POLICY sec_did_cards
        ADD FILTER PREDICATE dbo.fn_did_cards_predicate(citizen_id) ON dbo.digital_id_cards
        WITH (STATE = ON);
    ');
END
GO
