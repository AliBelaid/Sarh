-- =========================================================================
-- 023_verify_helpers.sql — RPC for the public /verify endpoint to read the
-- polygon as GeoJSON without granting the unauthenticated path SELECT on
-- properties (which contains owner PII via owner_citizen_id).
-- =========================================================================

CREATE OR REPLACE FUNCTION property_polygon_geojson(p_property_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_geo JSONB;
BEGIN
    SELECT
        CASE
            WHEN boundary_polygon IS NULL THEN NULL
            ELSE ST_AsGeoJSON(boundary_polygon)::jsonb
        END
    INTO v_geo
    FROM properties
    WHERE id = p_property_id
      AND status = 'approved';
    RETURN v_geo;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
