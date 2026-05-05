-- =========================================================================
-- 012_views.sql — read views for frequently joined queries
-- =========================================================================
USE [sarh];
GO

CREATE OR ALTER VIEW v_citizen_full_name
AS
SELECT
    id,
    first_name_ar + N' ' + father_name_ar + N' ' + grandfather_name_ar + N' ' + family_name_ar AS full_name_ar,
    COALESCE(first_name_en + N' ' + family_name_en, N'') AS full_name_en
FROM citizens;
GO

CREATE OR ALTER VIEW v_property_overview
AS
SELECT
    p.id,
    p.property_code,
    p.parcel_number,
    p.property_type,
    p.status,
    p.area_sqm,
    p.address_ar,
    c.first_name_ar + N' ' + c.family_name_ar AS owner_name,
    d.digital_id_number,
    -- ST_X / ST_Y -> .Long / .Lat on the geography type.
    p.location_point.Long AS lng,
    p.location_point.Lat  AS lat
FROM properties p
JOIN citizens c
    ON c.id = p.owner_citizen_id
LEFT JOIN digital_id_cards d
    ON d.citizen_id = c.id
   AND d.status = N'active';
GO
