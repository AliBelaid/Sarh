-- =========================================================================
-- 003_citizens.sql — citizens table + name search index
-- =========================================================================

CREATE TYPE gender_enum         AS ENUM ('male', 'female');
CREATE TYPE marital_status_enum AS ENUM ('single', 'married', 'divorced', 'widowed');

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
