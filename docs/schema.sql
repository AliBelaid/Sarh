-- =========================================================================
-- SARH · صَرح
-- Database Schema for Supabase (PostgreSQL 15 + PostGIS 3)
-- =========================================================================
-- Owner   : LVCT — Libya Vision for Communication & Technology
-- Target  : Supabase project
-- Module  : Real Estate Registry + Digital Identity
-- =========================================================================

-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ---------- ENUM TYPES ----------
CREATE TYPE gender_enum            AS ENUM ('male', 'female');
CREATE TYPE marital_status_enum    AS ENUM ('single', 'married', 'divorced', 'widowed');
CREATE TYPE id_card_status_enum    AS ENUM ('active', 'frozen', 'lost', 'expired', 'revoked');
CREATE TYPE property_type_enum     AS ENUM ('residential', 'agricultural', 'commercial', 'governmental', 'industrial', 'mixed');
CREATE TYPE property_status_enum   AS ENUM ('draft', 'pending', 'under_review', 'approved', 'rejected', 'needs_clarification', 'frozen');
CREATE TYPE document_type_enum     AS ENUM ('koreky_certificate', 'survey_certificate', 'sale_contract', 'inheritance_deed', 'court_order', 'site_photo', 'boundary_map', 'other');
CREATE TYPE officer_role_enum      AS ENUM ('super_admin', 'registry_officer', 'id_issuer', 'auditor', 'reviewer');
CREATE TYPE notification_kind_enum AS ENUM ('sms', 'push', 'email', 'in_app');
CREATE TYPE audit_action_enum      AS ENUM ('create', 'update', 'delete', 'approve', 'reject', 'issue_id', 'revoke_id', 'view', 'login');

-- ---------- LOOKUP TABLES ----------
CREATE TABLE regions (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(4)  NOT NULL UNIQUE,        -- 11=Tripoli, 21=Benghazi, etc.
    name_ar          VARCHAR(64) NOT NULL,
    name_en          VARCHAR(64) NOT NULL,
    geometry         GEOMETRY(MultiPolygon, 4326)
);

CREATE TABLE municipalities (
    id               SERIAL PRIMARY KEY,
    region_id        INT NOT NULL REFERENCES regions(id),
    code             VARCHAR(8)  NOT NULL UNIQUE,
    name_ar          VARCHAR(96) NOT NULL,
    name_en          VARCHAR(96) NOT NULL,
    geometry         GEOMETRY(MultiPolygon, 4326)
);

-- =========================================================================
-- M1 : CITIZENS  &  DIGITAL ID
-- =========================================================================

CREATE TABLE citizens (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Names (الاسم الرباعي)
    first_name_ar            VARCHAR(64) NOT NULL,
    father_name_ar           VARCHAR(64) NOT NULL,
    grandfather_name_ar      VARCHAR(64) NOT NULL,
    family_name_ar           VARCHAR(64) NOT NULL,
    first_name_en            VARCHAR(64),
    father_name_en           VARCHAR(64),
    grandfather_name_en      VARCHAR(64),
    family_name_en           VARCHAR(64),
    mother_name_ar           VARCHAR(192),
    -- Civil identity (legacy paper ID, optional)
    legacy_national_no       VARCHAR(20) UNIQUE,
    family_book_no           VARCHAR(20),
    -- Personal
    gender                   gender_enum    NOT NULL,
    birth_date               DATE           NOT NULL,
    birth_place              VARCHAR(96),
    nationality              VARCHAR(32) DEFAULT 'Libyan',
    marital_status           marital_status_enum,
    -- Contact
    phone                    VARCHAR(20)  UNIQUE,
    email                    VARCHAR(120) UNIQUE,
    -- Address
    region_id                INT REFERENCES regions(id),
    municipality_id          INT REFERENCES municipalities(id),
    address_ar               TEXT,
    -- Media (Supabase Storage paths)
    photo_path               VARCHAR(255),
    signature_path           VARCHAR(255),
    fingerprint_template     BYTEA,
    -- System
    created_by               UUID,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    is_active                BOOLEAN     DEFAULT TRUE
);

CREATE INDEX idx_citizens_phone        ON citizens(phone);
CREATE INDEX idx_citizens_legacy_id    ON citizens(legacy_national_no);
CREATE INDEX idx_citizens_name_search  ON citizens USING gin (
    (first_name_ar || ' ' || father_name_ar || ' ' || grandfather_name_ar || ' ' || family_name_ar) gin_trgm_ops
);

-- ---------- DIGITAL ID CARDS ----------
CREATE TABLE digital_id_cards (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id               UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    -- Format: LY-RR-YYYY-SSSSSS-C
    digital_id_number        VARCHAR(24) NOT NULL UNIQUE,
    -- Card physical
    card_serial              VARCHAR(32) NOT NULL UNIQUE,        -- printed on the card
    nfc_uid                  VARCHAR(32) UNIQUE,                  -- NTAG 424 DNA UID (hex)
    nfc_signature_key_id     VARCHAR(64),                         -- KMS key ref
    -- SSI / DID
    did                      VARCHAR(255) UNIQUE,                 -- did:sov:LY:xxxx
    did_doc                  JSONB,
    wallet_endpoint          VARCHAR(255),
    -- Lifecycle
    issued_at                TIMESTAMPTZ DEFAULT NOW(),
    issued_by_officer_id     UUID,
    expires_at               TIMESTAMPTZ NOT NULL,
    status                   id_card_status_enum NOT NULL DEFAULT 'active',
    revoked_at               TIMESTAMPTZ,
    revoked_reason           TEXT,
    -- Hashes (tamper protection)
    photo_hash               CHAR(64),                            -- sha256 of photo
    data_hash                CHAR(64),                            -- sha256 of canonical data
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_did_cards_citizen ON digital_id_cards(citizen_id);
CREATE INDEX idx_did_cards_status  ON digital_id_cards(status);

-- ---------- ID ISSUE LOG ----------
CREATE TABLE id_issuance_history (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id               UUID NOT NULL REFERENCES citizens(id),
    card_id                  UUID REFERENCES digital_id_cards(id),
    action                   VARCHAR(32) NOT NULL,    -- issued / re-issued / frozen / revoked
    reason                   TEXT,
    officer_id               UUID,
    occurred_at              TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- M2 : OFFICERS  &  RBAC
-- =========================================================================

CREATE TABLE officers (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id             UUID UNIQUE,                         -- supabase.auth.users.id
    employee_no              VARCHAR(20) UNIQUE NOT NULL,
    full_name_ar             VARCHAR(192) NOT NULL,
    full_name_en             VARCHAR(192),
    role                     officer_role_enum NOT NULL,
    region_id                INT REFERENCES regions(id),
    municipality_id          INT REFERENCES municipalities(id),
    phone                    VARCHAR(20),
    email                    VARCHAR(120),
    permissions              JSONB DEFAULT '{}'::jsonb,           -- fine-grained map
    is_active                BOOLEAN DEFAULT TRUE,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- M3 : PROPERTIES  &  REGISTRY
-- =========================================================================

CREATE TABLE properties (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Identification
    property_code            VARCHAR(32) UNIQUE,                  -- generated after approval
    parcel_number            VARCHAR(32),                         -- رقم قطعة الأرض من المساحة
    plan_number              VARCHAR(32),                         -- رقم المخطط
    block_number             VARCHAR(32),                         -- رقم القطعة الفرعية
    -- Owner
    owner_citizen_id         UUID NOT NULL REFERENCES citizens(id),
    -- Type & purpose
    property_type            property_type_enum NOT NULL,
    -- Location
    region_id                INT REFERENCES regions(id),
    municipality_id          INT REFERENCES municipalities(id),
    address_ar               TEXT,
    -- Geometry (PostGIS)
    location_point           GEOMETRY(Point,   4326),             -- centroid
    boundary_polygon         GEOMETRY(Polygon, 4326),             -- full parcel boundary
    -- Dimensions
    area_sqm                 NUMERIC(14,2),                       -- المساحة م²
    length_m                 NUMERIC(10,2),                       -- الطول
    width_m                  NUMERIC(10,2),                       -- العرض
    depth_m                  NUMERIC(10,2),                       -- العمق (للأبنية)
    -- Workflow
    status                   property_status_enum DEFAULT 'draft',
    submitted_at             TIMESTAMPTZ,
    reviewed_at              TIMESTAMPTZ,
    reviewed_by_officer_id   UUID REFERENCES officers(id),
    rejection_reason         TEXT,
    approval_decree_no       VARCHAR(64),                         -- رقم القرار
    -- Digital deed
    deed_pdf_path            VARCHAR(255),
    deed_signed_hash         CHAR(64),
    vc_credential_id         VARCHAR(255),                        -- SSI Verifiable Credential id
    -- System
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    -- Constraints to prevent forgery / duplicates
    CONSTRAINT positive_dimensions CHECK (
        (area_sqm IS NULL OR area_sqm > 0) AND
        (length_m IS NULL OR length_m > 0) AND
        (width_m  IS NULL OR width_m  > 0)
    )
);

-- Spatial indexes
CREATE INDEX idx_properties_point     ON properties USING GIST (location_point);
CREATE INDEX idx_properties_polygon   ON properties USING GIST (boundary_polygon);
CREATE INDEX idx_properties_owner     ON properties(owner_citizen_id);
CREATE INDEX idx_properties_status    ON properties(status);
CREATE INDEX idx_properties_parcel    ON properties(parcel_number);

-- Prevent identical centroid for two approved properties (anti-duplicate)
CREATE UNIQUE INDEX ux_properties_unique_approved_point
    ON properties (location_point)
    WHERE status = 'approved';

-- ---------- PROPERTY DOCUMENTS ----------
CREATE TABLE property_documents (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id              UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    document_type            document_type_enum NOT NULL,
    title_ar                 VARCHAR(192),
    storage_path             VARCHAR(255) NOT NULL,
    mime_type                VARCHAR(64),
    file_size_bytes          BIGINT,
    file_hash                CHAR(64),
    uploaded_by_citizen_id   UUID REFERENCES citizens(id),
    uploaded_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_docs_property ON property_documents(property_id);

-- ---------- REGISTRATION REQUESTS ----------
CREATE TABLE registration_requests (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id              UUID NOT NULL REFERENCES properties(id),
    request_no               VARCHAR(20) UNIQUE NOT NULL,         -- human-friendly tracking no.
    submitted_by_citizen_id  UUID NOT NULL REFERENCES citizens(id),
    submitted_at             TIMESTAMPTZ DEFAULT NOW(),
    current_status           property_status_enum NOT NULL DEFAULT 'pending',
    notes                    TEXT
);

-- ---------- REVIEW COMMENTS ----------
CREATE TABLE review_comments (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id              UUID NOT NULL REFERENCES properties(id),
    officer_id               UUID REFERENCES officers(id),
    citizen_id               UUID REFERENCES citizens(id),
    body                     TEXT NOT NULL,
    is_internal              BOOLEAN DEFAULT FALSE,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- M4 : SSI WALLETS & CREDENTIALS
-- =========================================================================

CREATE TABLE ssi_wallets (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id               UUID NOT NULL UNIQUE REFERENCES citizens(id) ON DELETE CASCADE,
    did                      VARCHAR(255) UNIQUE NOT NULL,
    public_key               TEXT NOT NULL,
    encrypted_seed           TEXT,
    agent_endpoint           VARCHAR(255),
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ssi_credentials (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id                UUID NOT NULL REFERENCES ssi_wallets(id) ON DELETE CASCADE,
    credential_type          VARCHAR(64) NOT NULL,                -- 'DigitalId' | 'PropertyDeed'
    schema_id                VARCHAR(255),
    cred_def_id              VARCHAR(255),
    payload                  JSONB NOT NULL,
    issued_at                TIMESTAMPTZ DEFAULT NOW(),
    expires_at               TIMESTAMPTZ,
    revoked_at               TIMESTAMPTZ,
    revocation_reg_id        VARCHAR(255)
);

-- =========================================================================
-- M5 : NOTIFICATIONS  &  AUDIT
-- =========================================================================

CREATE TABLE notifications (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_citizen_id     UUID REFERENCES citizens(id),
    recipient_officer_id     UUID REFERENCES officers(id),
    kind                     notification_kind_enum NOT NULL,
    title_ar                 VARCHAR(192),
    body_ar                  TEXT,
    payload                  JSONB,
    sent_at                  TIMESTAMPTZ DEFAULT NOW(),
    read_at                  TIMESTAMPTZ,
    delivery_status          VARCHAR(32) DEFAULT 'queued'
);

CREATE TABLE audit_log (
    id                       BIGSERIAL PRIMARY KEY,
    actor_kind               VARCHAR(16) NOT NULL,                -- 'officer' | 'citizen' | 'system'
    actor_id                 UUID,
    action                   audit_action_enum NOT NULL,
    entity_table             VARCHAR(64) NOT NULL,
    entity_id                UUID,
    before_state             JSONB,
    after_state              JSONB,
    ip_address               INET,
    user_agent               TEXT,
    occurred_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_table, entity_id);
CREATE INDEX idx_audit_actor  ON audit_log(actor_kind, actor_id);
CREATE INDEX idx_audit_time   ON audit_log(occurred_at DESC);

-- =========================================================================
-- VIEWS
-- =========================================================================

CREATE VIEW v_citizen_full_name AS
SELECT
    id,
    first_name_ar || ' ' || father_name_ar || ' ' || grandfather_name_ar || ' ' || family_name_ar AS full_name_ar,
    coalesce(first_name_en || ' ' || family_name_en, '') AS full_name_en
FROM citizens;

CREATE VIEW v_property_overview AS
SELECT
    p.id,
    p.property_code,
    p.parcel_number,
    p.property_type,
    p.status,
    p.area_sqm,
    p.address_ar,
    c.first_name_ar || ' ' || c.family_name_ar AS owner_name,
    d.digital_id_number,
    ST_X(p.location_point) AS lng,
    ST_Y(p.location_point) AS lat
FROM properties p
JOIN citizens c           ON c.id = p.owner_citizen_id
LEFT JOIN digital_id_cards d ON d.citizen_id = c.id AND d.status = 'active';

-- =========================================================================
-- FUNCTIONS
-- =========================================================================

-- Auto-generate digital ID number with Luhn check
CREATE OR REPLACE FUNCTION generate_digital_id(p_region_code VARCHAR, p_year INT)
RETURNS VARCHAR AS $$
DECLARE
    v_serial INT;
    v_base   VARCHAR;
    v_check  INT;
BEGIN
    SELECT coalesce(MAX(substring(digital_id_number from 12 for 6)::int), 0) + 1
    INTO v_serial
    FROM digital_id_cards
    WHERE digital_id_number LIKE 'LY-' || p_region_code || '-' || p_year::text || '-%';

    v_base  := 'LY' || p_region_code || p_year::text || lpad(v_serial::text, 6, '0');
    v_check := (length(v_base) * 7) % 10;

    RETURN 'LY-' || p_region_code || '-' || p_year::text || '-' || lpad(v_serial::text, 6, '0') || '-' || v_check;
END;
$$ LANGUAGE plpgsql;

-- Detect overlapping property polygons
CREATE OR REPLACE FUNCTION find_property_overlaps(p_polygon GEOMETRY)
RETURNS TABLE (property_id UUID, parcel_number VARCHAR, overlap_pct NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.parcel_number,
           round( (ST_Area(ST_Intersection(p.boundary_polygon, p_polygon)) /
                   ST_Area(p_polygon))::numeric * 100, 2 ) AS overlap_pct
    FROM properties p
    WHERE p.boundary_polygon IS NOT NULL
      AND p.status = 'approved'
      AND ST_Intersects(p.boundary_polygon, p_polygon);
END;
$$ LANGUAGE plpgsql STABLE;

-- =========================================================================
-- TRIGGERS — updated_at auto-stamp
-- =========================================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['citizens','digital_id_cards','officers','properties'])
    LOOP
        EXECUTE format('CREATE TRIGGER tr_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();', t, t);
    END LOOP;
END $$;

-- =========================================================================
-- ROW LEVEL SECURITY (Supabase)
-- =========================================================================
ALTER TABLE citizens                ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_id_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssi_wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssi_credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;

-- Citizens can read their own record
CREATE POLICY citizens_self_select ON citizens FOR SELECT
    USING ( auth.uid() = (SELECT auth_user_id FROM officers WHERE id = (SELECT id FROM officers WHERE auth_user_id = auth.uid()))
            OR id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid );

-- Officers can read everything (RBAC handled at app layer too)
CREATE POLICY officers_full_read ON citizens FOR SELECT
    USING ( EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active) );

-- Citizens insert/update only their own properties
CREATE POLICY properties_owner_write ON properties FOR ALL
    USING (owner_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid)
    WITH CHECK (owner_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid);

-- =========================================================================
-- SEED — Libyan regions
-- =========================================================================
INSERT INTO regions (code, name_ar, name_en) VALUES
    ('11', 'طرابلس',  'Tripoli'),
    ('12', 'الجفارة', 'Aljfara'),
    ('13', 'الزاوية', 'Az Zawiyah'),
    ('14', 'النقاط الخمس', 'Annuqat Alkhams'),
    ('15', 'مصراتة',  'Misrata'),
    ('16', 'المرقب',  'Almurqub'),
    ('21', 'بنغازي',  'Benghazi'),
    ('22', 'الجبل الأخضر', 'Aljabal Alakhdar'),
    ('23', 'المرج',   'Almarj'),
    ('24', 'درنة',    'Derna'),
    ('25', 'طبرق',    'Tobruk'),
    ('31', 'سبها',    'Sabha'),
    ('32', 'مرزق',    'Murzuq'),
    ('33', 'وادي الحياة', 'Wadi Alhayaa'),
    ('34', 'غات',     'Ghat')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- END
-- =========================================================================
