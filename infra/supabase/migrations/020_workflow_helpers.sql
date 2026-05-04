-- =========================================================================
-- 020_workflow_helpers.sql — property_code allocation
-- =========================================================================
--
-- Format: RR-YYYY-NNNNNN
--   RR     2-char region code (Shabiyah)
--   YYYY   4-digit approval year
--   NNNNNN 6-digit serial, monotonic per (region, year)
--
-- Sequential per region+year so two officers approving in the same region
-- never collide. The counter table is keyed (region_code, year) and is
-- bumped atomically by next_property_code().

CREATE TABLE property_code_seq (
    region_code  VARCHAR(4) NOT NULL,
    year         INT NOT NULL,
    last_no      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (region_code, year)
);

CREATE OR REPLACE FUNCTION next_property_code(p_region_code VARCHAR, p_year INT)
RETURNS VARCHAR AS $$
DECLARE
    v_no INT;
BEGIN
    IF p_region_code IS NULL OR p_region_code = '' THEN
        RAISE EXCEPTION 'next_property_code: region_code is required';
    END IF;
    INSERT INTO property_code_seq (region_code, year, last_no)
    VALUES (p_region_code, p_year, 1)
    ON CONFLICT (region_code, year) DO UPDATE
        SET last_no = property_code_seq.last_no + 1
    RETURNING last_no INTO v_no;
    RETURN p_region_code || '-' || p_year::text || '-' || lpad(v_no::text, 6, '0');
END;
$$ LANGUAGE plpgsql;
