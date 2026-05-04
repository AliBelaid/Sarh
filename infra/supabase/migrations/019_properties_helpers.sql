-- =========================================================================
-- 019_properties_helpers.sql — submission helpers (request_no + validator)
-- =========================================================================

-- ----- Sequential, year-scoped registration_request numbers -----
-- Counter table guarantees REQ-YYYY-000001, REQ-YYYY-000002, ... per year
-- with strict atomicity (no gaps under contention).
CREATE TABLE request_no_seq (
    year     INT PRIMARY KEY,
    last_no  INT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_registration_request_no(p_year INT)
RETURNS VARCHAR AS $$
DECLARE
    v_no INT;
BEGIN
    INSERT INTO request_no_seq (year, last_no)
    VALUES (p_year, 1)
    ON CONFLICT (year) DO UPDATE
        SET last_no = request_no_seq.last_no + 1
    RETURNING last_no INTO v_no;
    RETURN 'REQ-' || p_year::text || '-' || lpad(v_no::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ----- Submission validator -----
-- Computes the polygon's true area (via PostGIS, in square metres using
-- the Libya UTM zone 33N projection EPSG:32633), the percentage diff
-- against the citizen-claimed area, and whether an APPROVED property
-- already shares the same centroid (anti-duplicate per CLAUDE.md
-- constraint #3 — overlap is a soft warning, identical centroid is hard).
--
-- Returns one row even when no centroid match exists; consumers should
-- check has_approved_centroid_match.
CREATE TYPE property_submission_check AS (
    computed_area_sqm                NUMERIC,
    area_diff_pct                    NUMERIC,
    has_approved_centroid_match      BOOLEAN,
    matched_centroid_property_id     UUID,
    matched_centroid_property_code   VARCHAR
);

CREATE OR REPLACE FUNCTION validate_property_submission(
    p_polygon  GEOMETRY,
    p_area_sqm NUMERIC
)
RETURNS property_submission_check AS $$
DECLARE
    v_result   property_submission_check;
    v_centroid GEOMETRY;
    v_dup      RECORD;
BEGIN
    -- Project to a local metric CRS for accurate area calculation.
    v_result.computed_area_sqm := ST_Area(ST_Transform(p_polygon, 32633))::NUMERIC(14,2);
    v_result.area_diff_pct := CASE
        WHEN p_area_sqm IS NULL OR p_area_sqm = 0 THEN NULL
        ELSE round(
            abs(v_result.computed_area_sqm - p_area_sqm) / p_area_sqm * 100,
            2
        )
    END;

    v_centroid := ST_Centroid(p_polygon);

    SELECT p.id, p.property_code
    INTO v_dup
    FROM properties p
    WHERE p.status = 'approved'
      AND p.location_point IS NOT NULL
      AND ST_Equals(p.location_point, v_centroid)
    LIMIT 1;

    IF FOUND THEN
        v_result.has_approved_centroid_match := TRUE;
        v_result.matched_centroid_property_id := v_dup.id;
        v_result.matched_centroid_property_code := v_dup.property_code;
    ELSE
        v_result.has_approved_centroid_match := FALSE;
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----- Insert helper that auto-fills location_point from boundary_polygon -----
-- Avoids the API having to compute the centroid in two places.
CREATE OR REPLACE FUNCTION trg_properties_set_centroid() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.boundary_polygon IS NOT NULL AND NEW.location_point IS NULL THEN
        NEW.location_point := ST_Centroid(NEW.boundary_polygon);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_properties_set_centroid
    BEFORE INSERT OR UPDATE OF boundary_polygon ON properties
    FOR EACH ROW EXECUTE FUNCTION trg_properties_set_centroid();

-- ----- Insert helper used by the API (PostgREST RPC) -----
-- Wraps the boilerplate of converting GeoJSON to PostGIS geometry and
-- returns the new property id. Status starts as 'pending' (the citizen
-- has finished filling the wizard and tapped Submit).
CREATE OR REPLACE FUNCTION insert_property_with_polygon(
    p_owner_citizen_id  UUID,
    p_property_type     property_type_enum,
    p_region_id         INT,
    p_municipality_id   INT,
    p_address_ar        TEXT,
    p_parcel_number     VARCHAR,
    p_plan_number       VARCHAR,
    p_block_number      VARCHAR,
    p_polygon           TEXT,    -- GeoJSON
    p_area_sqm          NUMERIC,
    p_length_m          NUMERIC,
    p_width_m           NUMERIC,
    p_depth_m           NUMERIC
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO properties (
        owner_citizen_id, property_type, region_id, municipality_id, address_ar,
        parcel_number, plan_number, block_number,
        boundary_polygon,
        area_sqm, length_m, width_m, depth_m,
        status, submitted_at
    )
    VALUES (
        p_owner_citizen_id, p_property_type, p_region_id, p_municipality_id, p_address_ar,
        p_parcel_number, p_plan_number, p_block_number,
        ST_SetSRID(ST_GeomFromGeoJSON(p_polygon), 4326),
        p_area_sqm, p_length_m, p_width_m, p_depth_m,
        'pending', NOW()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ----- Spatial nearest-neighbour query -----
-- Uses geography casts so radius is interpreted as metres on WGS84.
CREATE OR REPLACE FUNCTION properties_nearby(
    p_point_wkt TEXT,
    p_radius_m  NUMERIC,
    p_limit     INT
)
RETURNS TABLE (
    id              UUID,
    property_code   VARCHAR,
    parcel_number   VARCHAR,
    property_type   property_type_enum,
    status          property_status_enum,
    area_sqm        NUMERIC,
    distance_m      NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.property_code,
        p.parcel_number,
        p.property_type,
        p.status,
        p.area_sqm,
        round(ST_Distance(p.location_point::geography, ST_GeomFromEWKT(p_point_wkt)::geography)::numeric, 2) AS distance_m
    FROM properties p
    WHERE p.location_point IS NOT NULL
      AND ST_DWithin(
          p.location_point::geography,
          ST_GeomFromEWKT(p_point_wkt)::geography,
          p_radius_m
      )
    ORDER BY p.location_point::geography <-> ST_GeomFromEWKT(p_point_wkt)::geography
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
