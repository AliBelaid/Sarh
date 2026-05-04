-- =========================================================================
-- 024_seed_demo.sql — demo data for "Demo login" (mobile + web).
-- Idempotent: safe to re-run.
--
-- Demo credentials: demo@sijilli.ly / Demo!12345
-- Bcrypt hash below was generated for that password (cost=10).
-- =========================================================================
USE [sijilli];
GO

DECLARE @demo_citizen_id UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000001';
DECLARE @demo_card_id    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000002';
DECLARE @demo_auth_id    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000003';
DECLARE @demo_email      NVARCHAR(120)    = N'demo@sijilli.ly';
DECLARE @demo_did_no     NVARCHAR(24)     = N'LY-99-2026-000000-0';
-- bcrypt('Demo!12345', 10). The API regenerates this on first run if the
-- hash is rejected (see AuthService.ensureDemoUser). Don't rely on this
-- exact value for security.
DECLARE @demo_pwhash     NVARCHAR(120)    = N'$2b$10$wJrjT9Z5Z0X4f1bN4F0VYO7p9b7cJv0u1n8QfQjJ6tQq9qJzqFbqu';

-- 1) Citizen
MERGE citizens AS tgt
USING (SELECT @demo_citizen_id AS id) AS src
   ON tgt.id = src.id
WHEN MATCHED THEN
    UPDATE SET first_name_ar       = N'مستخدم',
               father_name_ar      = N'تجريبي',
               grandfather_name_ar = N'صرح',
               family_name_ar      = N'ديمو',
               is_active           = 1
WHEN NOT MATCHED THEN
    INSERT (id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar,
            gender, birth_date, nationality, region_id, is_active)
    VALUES (@demo_citizen_id, N'مستخدم', N'تجريبي', N'صرح', N'ديمو',
            N'male', '1990-01-01', N'Libyan', 11, 1);
GO

-- 2) Digital ID card
DECLARE @demo_citizen_id UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000001';
DECLARE @demo_card_id    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000002';
DECLARE @demo_did_no     NVARCHAR(24)     = N'LY-99-2026-000000-0';

MERGE digital_id_cards AS tgt
USING (SELECT @demo_card_id AS id) AS src
   ON tgt.id = src.id
WHEN MATCHED THEN
    UPDATE SET status = N'active', expires_at = DATEADD(YEAR, 10, SYSDATETIMEOFFSET())
WHEN NOT MATCHED THEN
    INSERT (id, citizen_id, digital_id_number, card_serial,
            issued_at, expires_at, status)
    VALUES (@demo_card_id, @demo_citizen_id, @demo_did_no, N'DEMO-CARD-0001',
            SYSDATETIMEOFFSET(), DATEADD(YEAR, 10, SYSDATETIMEOFFSET()), N'active');
GO

-- 3) Auth user
DECLARE @demo_auth_id    UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000003';
DECLARE @demo_email      NVARCHAR(120)    = N'demo@sijilli.ly';
DECLARE @demo_pwhash     NVARCHAR(120)    = N'$2b$10$wJrjT9Z5Z0X4f1bN4F0VYO7p9b7cJv0u1n8QfQjJ6tQq9qJzqFbqu';
DECLARE @demo_app_meta   NVARCHAR(MAX)    = N'{"sijilli_role":"citizen","citizen_id":"00000000-0000-0000-0000-000000000001"}';
DECLARE @demo_user_meta  NVARCHAR(MAX)    = N'{"full_name_ar":"مستخدم تجريبي ديمو"}';

MERGE auth_users AS tgt
USING (SELECT @demo_auth_id AS id) AS src
   ON tgt.id = src.id
WHEN MATCHED THEN
    UPDATE SET encrypted_password = @demo_pwhash,
               raw_app_meta_data  = @demo_app_meta,
               email_confirmed_at = SYSDATETIMEOFFSET(),
               updated_at         = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN
    INSERT (id, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (@demo_auth_id, @demo_email, @demo_pwhash,
            SYSDATETIMEOFFSET(), @demo_app_meta, @demo_user_meta);
GO
