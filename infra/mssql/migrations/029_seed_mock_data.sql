-- =========================================================================
-- 029_seed_mock_data.sql — comprehensive mock dataset for first-run demos.
--
-- Adds extra citizens, a department-manager + id-issuer + reviewer officer,
-- sample properties at every workflow status, one minted NFT + ownership
-- history, and notifications. All inserts are idempotent (MERGE on a fixed
-- UUID), so this migration is safe to re-run.
--
-- Demo password for every seeded auth account: `Demo!12345`. The hash below
-- is bcrypt('Demo!12345', cost=10). The .NET DbSeeder re-stamps it on app
-- startup if BCrypt.Net.Verify rejects this exact hash for any reason
-- (different runtime, different library version, …).
-- =========================================================================
USE [sarh];
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── Auth users for the seeded officers (citizens use raw_app_meta_data) ──
-- Using one shared bcrypt('Demo!12345', 10) hash for all demo accounts so
-- the same password works everywhere during demos.
DECLARE @au_demo_pw NVARCHAR(120) = N'$2b$10$ojClQpIWDz6ZI32hL0.LG.SbxYc/uqJlpB71Y1kPpLFr.gh0ocWqa';

DECLARE @au_mgr  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000211';
DECLARE @au_idi  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000212';
DECLARE @au_rev  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000213';
DECLARE @au_ahmed   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000111';
DECLARE @au_fatima  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000112';
DECLARE @au_khaled  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000113';
DECLARE @au_layla   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000114';

;WITH src(id, email, app_meta) AS (
    SELECT * FROM (VALUES
        (@au_mgr,    N'manager@sarh.ly',  N'{"sarh_role":"department_manager"}'),
        (@au_idi,    N'idissuer@sarh.ly', N'{"sarh_role":"id_issuer"}'),
        (@au_rev,    N'reviewer@sarh.ly', N'{"sarh_role":"reviewer"}'),
        (@au_ahmed,  N'ahmed@sarh.ly',    N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000101"}'),
        (@au_fatima, N'fatima@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000102"}'),
        (@au_khaled, N'khaled@sarh.ly',   N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000103"}'),
        (@au_layla,  N'layla@sarh.ly',    N'{"sarh_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000104"}')
    ) AS v(id, email, app_meta)
)
MERGE auth_users AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    encrypted_password = @au_demo_pw,
    raw_app_meta_data  = s.app_meta,
    email_confirmed_at = SYSDATETIMEOFFSET(),
    updated_at         = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
VALUES
    (s.id, s.email, @au_demo_pw, SYSDATETIMEOFFSET(), s.app_meta);
GO

-- ── Citizens ──────────────────────────────────────────────────────────────
-- Fixed UUIDs so that downstream tables (properties, NFTs, …) can reference
-- them deterministically across re-runs.
DECLARE @c_ahmed   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @c_fatima  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000102';
DECLARE @c_khaled  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000103';
DECLARE @c_layla   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000104';

-- regions.id is bound to the Shabiyah code (016_seed_regions.sql uses
-- IDENTITY_INSERT). 11=Tripoli, 15=Misrata, 21=Benghazi.
;WITH src(id, first_ar, father_ar, grand_ar, family_ar, gender, dob, region, phone, email, legacy_no) AS (
    SELECT * FROM (VALUES
        (@c_ahmed,  N'أحمد',   N'محمد',  N'علي',     N'البارودي',  N'male',   '1985-03-15', 11, N'+218910000101', N'ahmed.albaroudi@example.ly',  N'118503150001'),
        (@c_fatima, N'فاطمة',  N'يوسف',  N'عبدالله', N'الزروق',    N'female', '1990-07-22', 11, N'+218910000102', N'fatima.alzarrouq@example.ly', N'119007220002'),
        (@c_khaled, N'خالد',   N'عمر',   N'سالم',    N'العبيدي',   N'male',   '1978-11-04', 21, N'+218910000103', N'khaled.alobeidi@example.ly',  N'217811040003'),
        (@c_layla,  N'ليلى',   N'صالح',  N'أحمد',    N'الترهوني',  N'female', '1995-01-30', 15, N'+218910000104', N'layla.altarhouni@example.ly', N'159501300004')
    ) AS v(id, first_ar, father_ar, grand_ar, family_ar, gender, dob, region, phone, email, legacy_no)
)
MERGE citizens AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    first_name_ar       = s.first_ar,
    father_name_ar      = s.father_ar,
    grandfather_name_ar = s.grand_ar,
    family_name_ar      = s.family_ar,
    is_active           = 1
WHEN NOT MATCHED THEN INSERT
    (id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar,
     gender, birth_date, nationality, region_id, phone, email, legacy_national_no, is_active)
VALUES
    (s.id, s.first_ar, s.father_ar, s.grand_ar, s.family_ar,
     s.gender, s.dob, N'Libyan', s.region, s.phone, s.email, s.legacy_no, 1);
GO

-- ── Officers (manager + id_issuer + extra reviewer) ───────────────────────
DECLARE @off_mgr   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000201';
DECLARE @off_idi   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000202';
DECLARE @off_rev   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000203';
DECLARE @au_mgr    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000211';
DECLARE @au_idi    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000212';
DECLARE @au_rev    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000213';

;WITH src(id, auth_id, employee_no, name_ar, name_en, role, region, email, perms) AS (
    SELECT * FROM (VALUES
        (@off_mgr, @au_mgr, N'EMP-MGR-1', N'مدير القسم',     N'Department Manager', N'department_manager', 11, N'manager@sarh.ly',  N'{"can_final_approve":true,"can_mint_nft":true}'),
        (@off_idi, @au_idi, N'EMP-IDI-1', N'مُصدِر الهوية',  N'ID Issuer',          N'id_issuer',          11, N'idissuer@sarh.ly', N'{"can_issue_card":true,"can_revoke_card":true}'),
        (@off_rev, @au_rev, N'EMP-REV-1', N'مراجع تقني',     N'Technical Reviewer', N'reviewer',           11, N'reviewer@sarh.ly', N'{"can_review":true}')
    ) AS v(id, auth_id, employee_no, name_ar, name_en, role, region, email, perms)
)
MERGE officers AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    auth_user_id = s.auth_id,
    is_active    = 1,
    role         = s.role,
    region_id    = s.region,
    permissions  = s.perms,
    updated_at   = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, auth_user_id, employee_no, full_name_ar, full_name_en, role, region_id, email, permissions, is_active)
VALUES
    (s.id, s.auth_id, s.employee_no, s.name_ar, s.name_en, s.role, s.region, s.email, s.perms, 1);
GO

-- ── Demo digital ID cards for the 4 extra citizens ────────────────────────
-- The existing demo citizen card lives in 024_seed_demo.sql.
DECLARE @c_ahmed   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @c_fatima  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000102';
DECLARE @off_idi   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000202';

DECLARE @card_ahmed  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000301';
DECLARE @card_fatima UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000302';

;WITH src(id, citizen_id, did_no, serial, nfc_uid, sov_did, status) AS (
    SELECT * FROM (VALUES
        (@card_ahmed,  @c_ahmed,  N'LY-11-2026-000101-0', N'CARD-DEMO-0101', N'04A1B2C3D4E5F601', N'did:sov:LY:demo:ahmed',  N'active'),
        (@card_fatima, @c_fatima, N'LY-11-2026-000102-0', N'CARD-DEMO-0102', N'04A1B2C3D4E5F602', N'did:sov:LY:demo:fatima', N'active')
    ) AS v(id, citizen_id, did_no, serial, nfc_uid, sov_did, status)
)
MERGE digital_id_cards AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status     = s.status,
    nfc_uid    = s.nfc_uid,
    did        = s.sov_did,
    expires_at = DATEADD(YEAR, 10, SYSDATETIMEOFFSET()),
    issued_by_officer_id = @off_idi,
    updated_at = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, citizen_id, digital_id_number, card_serial, nfc_uid, did,
     issued_at, expires_at, issued_by_officer_id, status)
VALUES
    (s.id, s.citizen_id, s.did_no, s.serial, s.nfc_uid, s.sov_did,
     SYSDATETIMEOFFSET(), DATEADD(YEAR, 10, SYSDATETIMEOFFSET()), @off_idi, s.status);
GO

-- ── Properties at various workflow statuses ───────────────────────────────
-- Polygons are tiny ~100m squares around Tripoli (~13.18°E, 32.88°N).
-- Geography uses left-hand orientation; SW→SE→NE→NW→SW is CCW (correct).
DECLARE @c_demo    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000001';
DECLARE @c_ahmed   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @c_fatima  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000102';
DECLARE @c_khaled  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000103';
DECLARE @c_layla   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000104';
DECLARE @off_mgr   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000201';
DECLARE @off_rev   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000203';
DECLARE @off_seed  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000011'; -- existing demo officer

DECLARE @prop_minted   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000401';
DECLARE @prop_approved UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000402';
DECLARE @prop_review   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000403';
DECLARE @prop_pending  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000404';

-- 1) Approved + minted NFT (Ahmed, Tripoli centre).
MERGE properties AS tgt
USING (SELECT @prop_minted AS id) AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status                 = N'minted',
    reviewed_by_officer_id = @off_rev,
    approved_by_manager_id = @off_mgr,
    final_approved_at      = SYSDATETIMEOFFSET(),
    approval_decree_no     = N'DEC-2026-0101',
    updated_at             = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, property_code, parcel_number, plan_number, block_number,
     owner_citizen_id, property_type, region_id, address_ar,
     boundary_polygon, area_sqm, status, submitted_at, reviewed_at,
     reviewed_by_officer_id, approved_by_manager_id, final_approved_at,
     approval_decree_no)
VALUES
    (@prop_minted, N'PRP-2026-0101', N'P-101', N'PLAN-A', N'B-1',
     @c_ahmed, N'residential', 11, N'طرابلس - شارع الجمهورية، حي الأندلس',
     geography::STGeomFromText(N'POLYGON((13.1800 32.8800, 13.1810 32.8800, 13.1810 32.8810, 13.1800 32.8810, 13.1800 32.8800))', 4326),
     12345.67, N'minted',
     DATEADD(DAY, -30, SYSDATETIMEOFFSET()),
     DATEADD(DAY, -10, SYSDATETIMEOFFSET()),
     @off_rev, @off_mgr, DATEADD(DAY, -5, SYSDATETIMEOFFSET()),
     N'DEC-2026-0101');
GO

-- 2) Approved (no NFT yet) — Fatima, Tripoli west.
DECLARE @c_fatima  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000102';
DECLARE @off_mgr   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000201';
DECLARE @off_rev   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000203';
DECLARE @prop_approved UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000402';

MERGE properties AS tgt
USING (SELECT @prop_approved AS id) AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status                 = N'approved',
    reviewed_by_officer_id = @off_rev,
    approved_by_manager_id = @off_mgr,
    final_approved_at      = SYSDATETIMEOFFSET(),
    updated_at             = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, property_code, parcel_number, plan_number, block_number,
     owner_citizen_id, property_type, region_id, address_ar,
     boundary_polygon, area_sqm, status, submitted_at, reviewed_at,
     reviewed_by_officer_id, approved_by_manager_id, final_approved_at,
     approval_decree_no)
VALUES
    (@prop_approved, N'PRP-2026-0102', N'P-102', N'PLAN-A', N'B-2',
     @c_fatima, N'residential', 11, N'طرابلس - شارع الفتح، حي حي الفلاح',
     geography::STGeomFromText(N'POLYGON((13.1700 32.8800, 13.1710 32.8800, 13.1710 32.8810, 13.1700 32.8810, 13.1700 32.8800))', 4326),
     8910.50, N'approved',
     DATEADD(DAY, -25, SYSDATETIMEOFFSET()),
     DATEADD(DAY, -7, SYSDATETIMEOFFSET()),
     @off_rev, @off_mgr, DATEADD(DAY, -2, SYSDATETIMEOFFSET()),
     N'DEC-2026-0102');
GO

-- 3) Under review — Khaled, Benghazi.
DECLARE @c_khaled  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000103';
DECLARE @off_rev   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000203';
DECLARE @prop_review UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000403';

MERGE properties AS tgt
USING (SELECT @prop_review AS id) AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status                 = N'under_review',
    reviewed_by_officer_id = @off_rev,
    updated_at             = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, property_code, parcel_number, owner_citizen_id, property_type,
     region_id, address_ar, boundary_polygon, area_sqm, status,
     submitted_at, reviewed_at, reviewed_by_officer_id)
VALUES
    (@prop_review, N'PRP-2026-0103', N'P-103', @c_khaled, N'commercial', 21,
     N'بنغازي - شارع جمال عبدالناصر، حي الكيش',
     geography::STGeomFromText(N'POLYGON((20.0670 32.1190, 20.0680 32.1190, 20.0680 32.1200, 20.0670 32.1200, 20.0670 32.1190))', 4326),
     5500.00, N'under_review',
     DATEADD(DAY, -8, SYSDATETIMEOFFSET()),
     DATEADD(DAY, -3, SYSDATETIMEOFFSET()),
     @off_rev);
GO

-- 4) Pending submission (no review yet) — Layla, Misrata.
DECLARE @c_layla UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000104';
DECLARE @prop_pending UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000404';

MERGE properties AS tgt
USING (SELECT @prop_pending AS id) AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status     = N'pending',
    updated_at = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, property_code, parcel_number, owner_citizen_id, property_type,
     region_id, address_ar, boundary_polygon, area_sqm, status,
     submitted_at)
VALUES
    (@prop_pending, N'PRP-2026-0104', N'P-104', @c_layla, N'agricultural', 15,
     N'مصراتة - منطقة الغيران',
     geography::STGeomFromText(N'POLYGON((15.0900 32.3700, 15.0925 32.3700, 15.0925 32.3725, 15.0900 32.3725, 15.0900 32.3700))', 4326),
     50000.00, N'pending',
     DATEADD(DAY, -1, SYSDATETIMEOFFSET()));
GO

-- ── Registration requests for the 4 mock properties ──────────────────────
-- Note: ck_reg_req_status doesn't include 'minted' — minted properties keep
-- the request at 'approved' (the request lifecycle is independent of the NFT).
DECLARE @c_ahmed       UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @c_fatima      UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000102';
DECLARE @c_khaled      UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000103';
DECLARE @c_layla       UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000104';
DECLARE @prop_minted   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000401';
DECLARE @prop_approved UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000402';
DECLARE @prop_review   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000403';
DECLARE @prop_pending  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000404';

DECLARE @req_minted   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000501';
DECLARE @req_approved UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000502';
DECLARE @req_review   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000503';
DECLARE @req_pending  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000504';

;WITH src(id, request_no, property_id, citizen_id, status) AS (
    SELECT * FROM (VALUES
        (@req_minted,   N'REQ-2026-0101', @prop_minted,   @c_ahmed,  N'approved'),
        (@req_approved, N'REQ-2026-0102', @prop_approved, @c_fatima, N'approved'),
        (@req_review,   N'REQ-2026-0103', @prop_review,   @c_khaled, N'under_review'),
        (@req_pending,  N'REQ-2026-0104', @prop_pending,  @c_layla,  N'pending')
    ) AS v(id, request_no, property_id, citizen_id, status)
)
MERGE registration_requests AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    current_status = s.status
WHEN NOT MATCHED THEN INSERT
    (id, request_no, property_id, submitted_by_citizen_id, current_status, submitted_at)
VALUES
    (s.id, s.request_no, s.property_id, s.citizen_id, s.status,
     DATEADD(DAY, -10, SYSDATETIMEOFFSET()));
GO

-- ── NFT for the minted property + initial_mint ownership history ─────────
DECLARE @prop_minted   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000401';
DECLARE @c_ahmed       UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @off_mgr       UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000201';
DECLARE @nft_id        UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000601';
DECLARE @oh_id         UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000701';

MERGE property_nfts AS tgt
USING (SELECT @nft_id AS id) AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    status     = N'minted',
    updated_at = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN INSERT
    (id, property_id, token_id, contract_address, network, standard,
     owner_did, owner_address, metadata_uri, metadata_sha256,
     mint_tx_hash, mint_block_number, minted_by_officer_id, status)
VALUES
    (@nft_id, @prop_minted,
     N'42', N'0xMockContractA0A1A2A3A4A5A6A7A8A9aAbBcCdDeE', N'ethereum-sepolia', N'ERC-721',
     N'did:sov:LY:demo:ahmed', N'0xAhMeDmOcKwAlLeT00000000000000000000000000',
     N'ipfs://bafkreigh2akiscaildchexmplsd4d4d4d4d4d4d4d4d4d4d4d4d4d4', REPLICATE('a',64),
     N'0xMintTxHashCafeBabe1234567890Cafe1234567890CafeBabe1234567890', 4500001,
     @off_mgr, N'minted');
GO

DECLARE @prop_minted UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000401';
DECLARE @c_ahmed     UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000101';
DECLARE @off_mgr     UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000201';
DECLARE @nft_id      UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000601';
DECLARE @oh_id       UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000701';

-- ownership_history is INSERT-only (INSTEAD OF triggers block UPDATE/DELETE),
-- so we INSERT only when the row is missing.
IF NOT EXISTS (SELECT 1 FROM ownership_history WHERE id = @oh_id)
BEGIN
    INSERT INTO ownership_history
        (id, property_id, nft_id, from_did, to_did,
         from_citizen_id, to_citizen_id,
         transfer_tx_hash, transfer_block_number,
         reason, notes_ar, recorded_by_officer_id, transferred_at)
    VALUES
        (@oh_id, @prop_minted, @nft_id, NULL, N'did:sov:LY:demo:ahmed',
         NULL, @c_ahmed,
         N'0xMintTxHashCafeBabe1234567890Cafe1234567890CafeBabe1234567890', 4500001,
         N'initial_mint', N'إصدار رخصة الملكية الأولى للقطعة.',
         @off_mgr, DATEADD(DAY, -5, SYSDATETIMEOFFSET()));
END
GO

-- ── Notifications for the demo citizen ──────────────────────────────────
DECLARE @c_demo  UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000001';
DECLARE @n_welcome UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000801';
DECLARE @n_approved UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000802';

;WITH src(id, citizen_id, title, body, kind) AS (
    SELECT * FROM (VALUES
        (@n_welcome,  @c_demo, N'مرحبا بك في سجلي',         N'تم إنشاء حسابك بنجاح. يمكنك الآن تقديم طلب تسجيل عقار.',                          N'in_app'),
        (@n_approved, @c_demo, N'تمت الموافقة على عقارك', N'تمت الموافقة على طلبك رقم REQ-2026-0102. اضغط لعرض السند الإلكتروني.', N'in_app')
    ) AS v(id, citizen_id, title, body, kind)
)
MERGE notifications AS tgt
USING src AS s ON tgt.id = s.id
WHEN MATCHED THEN UPDATE SET
    title_ar = s.title,
    body_ar  = s.body
WHEN NOT MATCHED THEN INSERT
    (id, recipient_citizen_id, title_ar, body_ar, kind, delivery_status)
VALUES
    (s.id, s.citizen_id, s.title, s.body, s.kind, N'queued');
GO

PRINT N'029_seed_mock_data.sql applied — citizens/officers/properties/NFTs/notifications seeded.';
GO
