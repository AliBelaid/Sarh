-- =========================================================================
-- 007_documents.sql — supporting documents uploaded for each property
-- =========================================================================

CREATE TYPE document_type_enum AS ENUM (
    'koreky_certificate',
    'survey_certificate',
    'sale_contract',
    'inheritance_deed',
    'court_order',
    'site_photo',
    'boundary_map',
    'other'
);

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
