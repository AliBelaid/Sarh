-- =========================================================================
-- 006_properties.sql — real estate parcels with PostGIS geometry
-- =========================================================================

CREATE TYPE property_type_enum   AS ENUM ('residential', 'agricultural', 'commercial', 'governmental', 'industrial', 'mixed');
CREATE TYPE property_status_enum AS ENUM ('draft', 'pending', 'under_review', 'approved', 'rejected', 'needs_clarification', 'frozen');

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

-- Prevent identical centroid for two approved properties (anti-duplicate).
-- Polygon overlap is a soft warning at the application layer (legacy paper
-- deeds may legitimately conflict — see CLAUDE.md constraint #3).
CREATE UNIQUE INDEX ux_properties_unique_approved_point
    ON properties (location_point)
    WHERE status = 'approved';
