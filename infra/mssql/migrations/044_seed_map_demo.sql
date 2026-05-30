-- =========================================================================
-- 044_seed_map_demo.sql — make all four cadastral-map colours demonstrable
-- =========================================================================
-- The base demo set only yields 🟢 clear + 🟡 pending parcels. To exercise the
-- public/officer maps fully we promote one approved Tripoli parcel to a
-- governmental (🔵 public) holding and place an active court seizure on
-- another (🔴 disputed). Both operations are idempotent so a db:reset (which
-- re-runs every migration) stays stable.
-- =========================================================================
USE [sarh];
GO

-- 🔵 public — flip an approved residential parcel to governmental ownership.
UPDATE properties
SET    property_type = N'governmental'
WHERE  property_code = N'11-2026-000007'
  AND  status IN (N'approved', N'minted', N'transferred')
  AND  property_type <> N'governmental';
GO

-- 🔴 disputed — record an active judicial seizure on another approved parcel,
-- only if it doesn't already carry an active encumbrance.
DECLARE @prop UNIQUEIDENTIFIER =
    (SELECT id FROM properties WHERE property_code = N'11-2026-000006');
DECLARE @officer UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000011';

IF @prop IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM property_disputes
                   WHERE property_id = @prop AND status = N'active')
BEGIN
    INSERT INTO property_disputes
        (property_id, dispute_type, case_number, issuing_authority,
         start_date, status, notes, recorded_by_officer_id)
    VALUES
        (@prop, N'judicial_seizure', N'2026/١٤٧', N'محكمة طرابلس الابتدائية',
         CAST(SYSDATETIMEOFFSET() AS DATE), N'active',
         N'حجز تحفّظي لعرض الخريطة العقارية (بيانات تجريبية).', @officer);
END
GO

PRINT N'044_seed_map_demo.sql applied.';
GO
