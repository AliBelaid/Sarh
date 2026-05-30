-- =========================================================================
-- 043_property_map.sql — bulk parcel feed for the public + officer maps
-- =========================================================================
-- Two map surfaces consume this proc:
--   • The PUBLIC "الخريطة العقارية" map (verify.sarh.ly, unauthenticated) —
--     only parcels whose deed has been issued (approved/minted/transferred).
--     It shows polygon + public attributes ONLY (code, area, type, status,
--     last-update). Owner name / national number never leave the API.
--   • The OFFICER map — every in-scope parcel including those still in the
--     workflow, so a registry officer sees pending requests as well.
--
-- The colour the clients paint each polygon is a DERIVED "map_status", not a
-- stored column — it is computed here from authoritative data so it can never
-- drift out of sync with the workflow status / dispute table:
--   🟢 clear     — deed issued, no active encumbrance, privately owned
--   🔴 disputed  — an ACTIVE property_disputes row (seizure/lien/waqf/…)
--   🟡 pending   — still in the workflow (not yet an issued deed)
--   🔵 public    — deed issued, governmental / public-utility ownership
-- Precedence: disputed > public/clear (deed-issued) > pending. A disputed
-- parcel is red regardless of type so a verifier is never lulled by a green.
-- =========================================================================
USE [sarh];
GO

CREATE OR ALTER PROCEDURE dbo.property_map_features
    @p_public    BIT,
    @p_region_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- "Deed issued" = the same set the public verify endpoint treats as
    -- publicly verifiable (see VerifyService.PublicStatuses).
    ;WITH issued AS (
        SELECT N'approved' AS s UNION ALL SELECT N'minted' UNION ALL SELECT N'transferred'
    ),
    active_disp AS (
        SELECT DISTINCT property_id
        FROM property_disputes
        WHERE status = N'active'
    )
    SELECT
        p.id,
        p.property_code,
        p.parcel_number,
        p.property_type,
        p.status,
        p.region_id,
        p.area_sqm,
        p.updated_at,
        CASE WHEN d.property_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS has_active_dispute,
        CASE
            WHEN d.property_id IS NOT NULL                                                   THEN N'disputed'
            WHEN p.status IN (N'approved', N'minted', N'transferred')
                 AND p.property_type = N'governmental'                                       THEN N'public'
            WHEN p.status IN (N'approved', N'minted', N'transferred')                        THEN N'clear'
            ELSE                                                                                  N'pending'
        END AS map_status,
        -- Marker anchor: the stored centroid if present, else the polygon's
        -- envelope centre. Method invocation is only legal on a column/var,
        -- so resolve the point in a CROSS APPLY first.
        c.pt.Long AS lng,
        c.pt.Lat  AS lat,
        dbo.fn_polygon_to_geojson(p.boundary_polygon) AS boundary_polygon_geojson
    FROM properties p
    CROSS APPLY (SELECT COALESCE(p.location_point, p.boundary_polygon.EnvelopeCenter()) AS pt) c
    LEFT JOIN active_disp d ON d.property_id = p.id
    WHERE p.boundary_polygon IS NOT NULL
      AND (@p_region_id IS NULL OR p.region_id = @p_region_id)
      AND (
            -- Public surface: deed-issued parcels only.
            (@p_public = 1 AND p.status IN (SELECT s FROM issued))
            OR
            -- Officer surface: everything that is "live" in the workflow.
            -- draft + rejected are intentionally excluded as noise.
            (@p_public = 0 AND p.status IN
                (N'pending', N'under_review', N'needs_clarification',
                 N'approved', N'minted', N'transferred', N'frozen'))
          );
END
GO

PRINT N'043_property_map.sql applied.';
GO
