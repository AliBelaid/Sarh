-- =========================================================================
-- 021_workflow_review_view.sql — RPC the API uses to load a property for
-- officer review in a single round-trip, including the polygon as GeoJSON
-- (so the SSI VC payload can hash it) and the trimmed identification
-- columns the workflow needs.
-- =========================================================================
--
-- Returns a single row (or empty result) for the given property id. The
-- API calls this via RPC + .maybeSingle().

CREATE OR REPLACE FUNCTION property_review_view(p_property_id UUID)
RETURNS TABLE (
    id                          UUID,
    property_code               VARCHAR,
    status                      property_status_enum,
    region_id                   INT,
    property_type               property_type_enum,
    area_sqm                    NUMERIC,
    address_ar                  TEXT,
    parcel_number               VARCHAR,
    owner_citizen_id            UUID,
    boundary_polygon_geojson    TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT  p.id,
            p.property_code,
            p.status,
            p.region_id,
            p.property_type,
            p.area_sqm,
            p.address_ar,
            p.parcel_number,
            p.owner_citizen_id,
            CASE
                WHEN p.boundary_polygon IS NULL THEN NULL
                ELSE ST_AsGeoJSON(p.boundary_polygon)
            END AS boundary_polygon_geojson
    FROM properties p
    WHERE p.id = p_property_id;
END;
$$ LANGUAGE plpgsql STABLE;
