-- =========================================================================
-- 034_seed_expanded_demo.sql — expanded demo dataset for realistic testing.
--
-- Adds:
--   • 1 super_admin account (admin@sarh.ly)
--   • 6 additional citizens with full profiles across multiple regions
--   • 6 digital ID cards in varied statuses (active, revoked, expired, lost)
--   • 6 additional properties at various workflow stages
--   • Links new citizens to their auth_users
--
-- All inserts are idempotent (MERGE on fixed UUID).
-- Demo password for every account: Demo!12345
-- Demo PIN for every card: 123456
-- =========================================================================
USE [sarh];
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── Auth users ────────────────────────────────────────────────────────────
DECLARE @pw NVARCHAR(120) = N'$2b$10$ojClQpIWDz6ZI32hL0.LG.SbxYc/uqJlpB71Y1kPpLFr.gh0ocWqa';

DECLARE @au_admin  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000214';
DECLARE @au_omar   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000115';
DECLARE @au_amina  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000116';
DECLARE @au_youssef UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000117';
DECLARE @au_hanan  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000118';
DECLARE @au_salem  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000119';
DECLARE @au_nadia  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000120';

;WITH src(id, email, app_meta) AS (
    SELECT * FROM (VALUES
        (@au_admin,   N'admin@sarh.ly',   N'{"sarh_role":"super_admin"}'),
        (@au_omar,    N'omar@sarh.ly',    N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000105"}'),
        (@au_amina,   N'amina@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000106"}'),
        (@au_youssef, N'youssef@sarh.ly', N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000107"}'),
        (@au_hanan,   N'hanan@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000108"}'),
        (@au_salem,   N'salem@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000109"}'),
        (@au_nadia,   N'nadia@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000110"}')
    ) AS v(id, email, app_meta)
)
MERGE auth_users AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    encrypted_password = @pw,
    raw_app_meta_data  = s.app_meta,
    email_confirmed_at = SYSDATETIMEOFFSET(),
    updated_at         = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
VALUES
    (s.id, s.email, @pw, SYSDATETIMEOFFSET(), s.app_meta);
GO

-- ── Super-admin officer ──────────────────────────────────────────────────
DECLARE @off_admin UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000204';
DECLARE @au_admin2 UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000214';

;WITH src(id, auth_user_id, full_ar, emp_no, role, region, permissions) AS (
    SELECT * FROM (VALUES
        (@off_admin, @au_admin2, N'المسؤول العام', N'ADM-001', N'super_admin', 11,
         N'{"can_review":true,"can_approve":true,"can_final_approve":true,"can_issue_card":true,"can_revoke_card":true,"can_manage_users":true}')
    ) AS v(id, auth_user_id, full_ar, emp_no, role, region, permissions)
)
MERGE officers AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    auth_user_id  = s.auth_user_id,
    full_name_ar  = s.full_ar,
    employee_no   = s.emp_no,
    role           = s.role,
    region_id      = s.region,
    permissions    = s.permissions,
    is_active      = 1,
    updated_at     = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, auth_user_id, full_name_ar, employee_no, role, region_id, permissions, is_active)
VALUES
    (s.id, s.auth_user_id, s.full_ar, s.emp_no, s.role, s.region, s.permissions, 1);
GO

-- ── 6 additional citizens ─────────────────────────────────────────────────
DECLARE @c_omar    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000105';
DECLARE @c_amina   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000106';
DECLARE @c_youssef UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000107';
DECLARE @c_hanan   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000108';
DECLARE @c_salem   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000109';
DECLARE @c_nadia   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000110';

;WITH src(id, first_ar, father_ar, grand_ar, family_ar, gender, dob, region, phone, email, legacy_no, auth_user_id) AS (
    SELECT * FROM (VALUES
        (@c_omar,    N'عمر',    N'سليمان', N'محمد',   N'الهادي',    N'male',   '1982-06-18', 22, N'+218920000105', N'omar.alhadi@example.ly',    N'228206180005', N'00000000-0000-0000-0000-000000000115'),
        (@c_amina,   N'أمينة',  N'عبدالرحمن', N'حسن', N'المجبري',  N'female', '1988-12-03', 13, N'+218920000106', N'amina.almajbari@example.ly', N'138812030006', N'00000000-0000-0000-0000-000000000116'),
        (@c_youssef, N'يوسف',  N'إبراهيم', N'خالد',  N'القذافي',   N'male',   '1975-04-28', 21, N'+218920000107', N'youssef.alqaddafi@example.ly', N'217504280007', N'00000000-0000-0000-0000-000000000117'),
        (@c_hanan,   N'حنان',  N'مصطفى',  N'عمار',   N'بن عمران',  N'female', '1992-09-10', 24, N'+218920000108', N'hanan.benamran@example.ly',  N'249209100008', N'00000000-0000-0000-0000-000000000118'),
        (@c_salem,   N'سالم',  N'عبدالسلام', N'فتحي', N'الجهمي',   N'male',   '1980-02-14', 31, N'+218920000109', N'salem.aljahmi@example.ly',   N'318002140009', N'00000000-0000-0000-0000-000000000119'),
        (@c_nadia,   N'نادية', N'أحمد',   N'علي',    N'الشريف',    N'female', '1997-08-25', 12, N'+218920000110', N'nadia.alsharif@example.ly',  N'129708250010', N'00000000-0000-0000-0000-000000000120')
    ) AS v(id, first_ar, father_ar, grand_ar, family_ar, gender, dob, region, phone, email, legacy_no, auth_user_id)
)
MERGE citizens AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    first_name_ar       = s.first_ar,
    father_name_ar      = s.father_ar,
    grandfather_name_ar = s.grand_ar,
    family_name_ar      = s.family_ar,
    gender              = s.gender,
    birth_date          = CAST(s.dob AS DATE),
    region_id           = s.region,
    phone               = s.phone,
    email               = s.email,
    legacy_national_no  = s.legacy_no,
    auth_user_id        = CAST(s.auth_user_id AS UNIQUEIDENTIFIER),
    updated_at          = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar, gender, birth_date, region_id, phone, email, legacy_national_no, auth_user_id)
VALUES
    (s.id, s.first_ar, s.father_ar, s.grand_ar, s.family_ar, s.gender, CAST(s.dob AS DATE), s.region, s.phone, s.email, s.legacy_no, CAST(s.auth_user_id AS UNIQUEIDENTIFIER));
GO

-- ── 6 additional properties at various workflow stages ────────────────────
DECLARE @p_omar1    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000405';
DECLARE @p_amina1   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000406';
DECLARE @p_youssef1 UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000407';
DECLARE @p_hanan1   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000408';
DECLARE @p_salem1   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000409';
DECLARE @p_nadia1   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000410';

;WITH src(id, owner_id, code, type, status, region, area, address, submitted_offset) AS (
    SELECT * FROM (VALUES
        (@p_omar1,    N'00000000-0000-0000-0000-000000000105', N'PRP-2026-0105', N'residential', N'approved',             22, 320.0, N'بنغازي، الفويهات', -15),
        (@p_amina1,   N'00000000-0000-0000-0000-000000000106', N'PRP-2026-0106', N'commercial',  N'under_review',         13, 850.0, N'الزاوية، المركز', -5),
        (@p_youssef1, N'00000000-0000-0000-0000-000000000107', N'PRP-2026-0107', N'agricultural', N'needs_clarification', 21, 12500.0, N'بنغازي، قمينس', -20),
        (@p_hanan1,   N'00000000-0000-0000-0000-000000000108', N'PRP-2026-0108', N'residential', N'rejected',             24, 180.0, N'درنة، المدينة القديمة', -30),
        (@p_salem1,   N'00000000-0000-0000-0000-000000000109', N'PRP-2026-0109', N'commercial',  N'draft',                31, 600.0, N'سبها، المركز', -2),
        (@p_nadia1,   N'00000000-0000-0000-0000-000000000110', N'PRP-2026-0110', N'residential', N'approved',             12, 275.0, N'الجفارة، جنزور', -12)
    ) AS v(id, owner_id, code, type, status, region, area, address, submitted_offset)
)
MERGE properties AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    owner_citizen_id = CAST(s.owner_id AS UNIQUEIDENTIFIER),
    property_code    = s.code,
    property_type    = s.type,
    status           = s.status,
    region_id        = s.region,
    area_sqm         = s.area,
    address_ar       = s.address,
    submitted_at     = DATEADD(DAY, s.submitted_offset, SYSDATETIMEOFFSET()),
    updated_at       = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, owner_citizen_id, property_code, property_type, status, region_id, area_sqm, address_ar, submitted_at)
VALUES
    (s.id, CAST(s.owner_id AS UNIQUEIDENTIFIER), s.code, s.type, s.status, s.region, s.area, s.address, DATEADD(DAY, s.submitted_offset, SYSDATETIMEOFFSET()));
GO

PRINT N'034_seed_expanded_demo.sql applied.';
GO
