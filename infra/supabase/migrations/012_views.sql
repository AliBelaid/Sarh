-- =========================================================================
-- 012_views.sql — read views for frequently joined queries
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
