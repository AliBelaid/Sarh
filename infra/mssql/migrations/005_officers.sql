-- =========================================================================
-- 005_officers.sql — officers + RBAC permissions
-- =========================================================================
USE [sijilli];
GO

CREATE TABLE officers (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    -- Local auth user id (was supabase.auth.users.id). Now a foreign key
    -- into the local `auth_users` table created by 017_auth_helpers.sql.
    auth_user_id    UNIQUEIDENTIFIER NULL UNIQUE,
    employee_no     NVARCHAR(20)  NOT NULL UNIQUE,
    full_name_ar    NVARCHAR(192) NOT NULL,
    full_name_en    NVARCHAR(192) NULL,
    role            NVARCHAR(32)  NOT NULL
        CONSTRAINT ck_officers_role CHECK (role IN (N'super_admin', N'registry_officer', N'id_issuer', N'auditor', N'reviewer')),
    region_id       INT           NULL REFERENCES regions(id),
    municipality_id INT           NULL REFERENCES municipalities(id),
    phone           NVARCHAR(20)  NULL,
    email           NVARCHAR(120) NULL,
    -- Fine-grained permission map (was JSONB).
    permissions     NVARCHAR(MAX) NOT NULL DEFAULT N'{}'
        CONSTRAINT ck_officers_permissions_json CHECK (ISJSON(permissions) = 1),
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_officers_role   ON officers(role);
CREATE INDEX idx_officers_region ON officers(region_id);
GO
