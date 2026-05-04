-- =========================================================================
-- 005_officers.sql — officers + RBAC permissions
-- =========================================================================

CREATE TYPE officer_role_enum AS ENUM ('super_admin', 'registry_officer', 'id_issuer', 'auditor', 'reviewer');

CREATE TABLE officers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id    UUID UNIQUE,                         -- supabase.auth.users.id
    employee_no     VARCHAR(20) UNIQUE NOT NULL,
    full_name_ar    VARCHAR(192) NOT NULL,
    full_name_en    VARCHAR(192),
    role            officer_role_enum NOT NULL,
    region_id       INT REFERENCES regions(id),
    municipality_id INT REFERENCES municipalities(id),
    phone           VARCHAR(20),
    email           VARCHAR(120),
    permissions     JSONB DEFAULT '{}'::jsonb,           -- fine-grained map
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_officers_role     ON officers(role);
CREATE INDEX idx_officers_region   ON officers(region_id);
