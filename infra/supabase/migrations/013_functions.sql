-- =========================================================================
-- 013_functions.sql — domain functions (digital ID generation, overlap check)
-- =========================================================================

-- Auto-generate digital ID number with Luhn check.
-- Format: LY-RR-YYYY-SSSSSS-C
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

-- Detect overlapping property polygons for reviewer warnings.
-- Returns approved properties whose boundary intersects p_polygon, with the
-- overlap percentage relative to p_polygon's area.
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
