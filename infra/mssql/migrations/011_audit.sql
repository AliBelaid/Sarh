-- =========================================================================
-- 011_audit.sql — append-only audit log (CLAUDE.md constraint #6)
-- =========================================================================
USE [sarh];
GO

CREATE TABLE audit_log (
    id            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    actor_kind    NVARCHAR(16) NOT NULL,
    actor_id      UNIQUEIDENTIFIER NULL,
    action        NVARCHAR(16) NOT NULL
        CONSTRAINT ck_audit_action CHECK (action IN
            (N'create', N'update', N'delete', N'approve', N'reject',
             N'issue_id', N'revoke_id', N'view', N'login')),
    entity_table  NVARCHAR(64) NOT NULL,
    entity_id     UNIQUEIDENTIFIER NULL,
    before_state  NVARCHAR(MAX) NULL CONSTRAINT ck_audit_before_json CHECK (before_state IS NULL OR ISJSON(before_state) = 1),
    after_state   NVARCHAR(MAX) NULL CONSTRAINT ck_audit_after_json  CHECK (after_state  IS NULL OR ISJSON(after_state)  = 1),
    -- Postgres INET -> NVARCHAR(45). Holds IPv6.
    ip_address    NVARCHAR(45) NULL,
    user_agent    NVARCHAR(MAX) NULL,
    occurred_at   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_audit_entity ON audit_log(entity_table, entity_id);
CREATE INDEX idx_audit_actor  ON audit_log(actor_kind, actor_id);
CREATE INDEX idx_audit_time   ON audit_log(occurred_at DESC);
GO

-- Enforce append-only at the DB layer. SQL Server has no "BEFORE UPDATE"
-- triggers; INSTEAD OF triggers cancel the operation by raising an error
-- and never executing the inner DML.
CREATE OR ALTER TRIGGER tr_audit_log_no_update ON audit_log
INSTEAD OF UPDATE
AS
BEGIN
    THROW 51001, N'audit_log is append-only — UPDATE blocked', 1;
END
GO

CREATE OR ALTER TRIGGER tr_audit_log_no_delete ON audit_log
INSTEAD OF DELETE
AS
BEGIN
    THROW 51002, N'audit_log is append-only — DELETE blocked', 1;
END
GO
