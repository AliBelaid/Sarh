-- =========================================================================
-- 006_properties.sql — real estate parcels with SQL Server geography
-- =========================================================================
USE [sarh];
GO

CREATE TABLE properties (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    -- Identification
    property_code            NVARCHAR(32)  NULL UNIQUE,
    parcel_number            NVARCHAR(32)  NULL,
    plan_number              NVARCHAR(32)  NULL,
    block_number             NVARCHAR(32)  NULL,
    -- Owner
    owner_citizen_id         UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_properties_owner REFERENCES citizens(id),
    -- Type & purpose
    property_type            NVARCHAR(16) NOT NULL
        CONSTRAINT ck_properties_type CHECK (property_type IN
            (N'residential', N'agricultural', N'commercial', N'governmental', N'industrial', N'mixed')),
    -- Location
    region_id                INT NULL REFERENCES regions(id),
    municipality_id          INT NULL REFERENCES municipalities(id),
    address_ar               NVARCHAR(MAX) NULL,
    -- Geometry (SRID 4326 lon/lat). geography handles the spheroidal math.
    location_point           geography NULL,
    boundary_polygon         geography NULL,
    -- WKT-stable WGS84 lon/lat copy of the centroid for the anti-duplicate
    -- unique index below. SQL Server cannot index geography directly, and
    -- filtered indexes can't reference *computed* columns, so this is a
    -- plain NVARCHAR populated by the trigger in 019_properties_helpers.sql.
    location_point_wkt       NVARCHAR(40) NULL,
    -- Dimensions
    area_sqm                 DECIMAL(14,2) NULL,
    length_m                 DECIMAL(10,2) NULL,
    width_m                  DECIMAL(10,2) NULL,
    depth_m                  DECIMAL(10,2) NULL,
    -- Workflow
    status                   NVARCHAR(24) NOT NULL DEFAULT N'draft'
        CONSTRAINT ck_properties_status CHECK (status IN
            (N'draft', N'pending', N'under_review', N'approved', N'rejected', N'needs_clarification', N'frozen')),
    submitted_at             DATETIMEOFFSET(3) NULL,
    reviewed_at              DATETIMEOFFSET(3) NULL,
    reviewed_by_officer_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_properties_reviewer REFERENCES officers(id),
    rejection_reason         NVARCHAR(MAX) NULL,
    approval_decree_no       NVARCHAR(64)  NULL,
    -- Digital deed
    deed_pdf_path            NVARCHAR(255) NULL,
    deed_signed_hash         CHAR(64)      NULL,
    vc_credential_id         NVARCHAR(255) NULL,
    -- System
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- Constraints
    CONSTRAINT ck_properties_positive_dims CHECK (
        (area_sqm IS NULL OR area_sqm > 0) AND
        (length_m IS NULL OR length_m > 0) AND
        (width_m  IS NULL OR width_m  > 0)
    )
);
GO

-- Spatial indexes (replaces PostGIS GIST).
CREATE SPATIAL INDEX idx_properties_point   ON properties(location_point)
    USING GEOGRAPHY_AUTO_GRID;
CREATE SPATIAL INDEX idx_properties_polygon ON properties(boundary_polygon)
    USING GEOGRAPHY_AUTO_GRID;
GO

CREATE INDEX idx_properties_owner    ON properties(owner_citizen_id);
CREATE INDEX idx_properties_status   ON properties(status);
CREATE INDEX idx_properties_parcel   ON properties(parcel_number);
GO

-- Anti-duplicate: no two approved properties may share the exact centroid.
-- Postgres did this with a partial unique index on location_point WHERE
-- status='approved'. SQL Server cannot index geography directly, so we
-- index the persisted WKT projection.
CREATE UNIQUE INDEX ux_properties_unique_approved_point
    ON properties(location_point_wkt)
    WHERE status = N'approved' AND location_point_wkt IS NOT NULL;
GO
