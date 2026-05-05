-- =========================================================================
-- 026_seed_demo_officer.sql — demo officer + property submission for the
-- Phase 3 .NET workflow smoke tests.
-- Idempotent: safe to re-run.
--
-- Demo officer credentials: officer@sarh.ly / Officer!12345
-- =========================================================================
USE [sarh];
GO

DECLARE @off_auth_id   UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000010';
DECLARE @off_id        UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000011';
DECLARE @off_email     NVARCHAR(120)    = N'officer@sarh.ly';
-- bcrypt('Officer!12345', 10)
DECLARE @off_pwhash    NVARCHAR(120)    = N'$2b$10$Mkfd3xb.AZRwhi.kolBN6eY308A2WkjISVJNyfrIjGCvJSyzuV.7G';
DECLARE @off_app_meta  NVARCHAR(MAX)    = N'{"sarh_role":"registry_officer"}';
DECLARE @off_user_meta NVARCHAR(MAX)    = N'{"full_name_ar":"موظف ديمو"}';

-- 1) Auth user for the officer.
MERGE auth_users AS tgt
USING (SELECT @off_auth_id AS id) AS src
   ON tgt.id = src.id
WHEN MATCHED THEN
    UPDATE SET email              = @off_email,
               encrypted_password = @off_pwhash,
               raw_app_meta_data  = @off_app_meta,
               raw_user_meta_data = @off_user_meta,
               email_confirmed_at = SYSDATETIMEOFFSET(),
               updated_at         = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN
    INSERT (id, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (@off_auth_id, @off_email, @off_pwhash,
            SYSDATETIMEOFFSET(), @off_app_meta, @off_user_meta);
GO

-- 2) Officers row linked to the auth user.
DECLARE @off_auth_id UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000010';
DECLARE @off_id      UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000011';

MERGE officers AS tgt
USING (SELECT @off_id AS id) AS src
   ON tgt.id = src.id
WHEN MATCHED THEN
    UPDATE SET is_active   = 1,
               role        = N'registry_officer',
               region_id   = 11,
               updated_at  = SYSDATETIMEOFFSET()
WHEN NOT MATCHED THEN
    INSERT (id, auth_user_id, employee_no, full_name_ar, full_name_en,
            role, region_id, email, permissions, is_active)
    VALUES (@off_id, @off_auth_id, N'EMP-DEMO-1', N'موظف ديمو', N'Demo Officer',
            N'registry_officer', 11, N'officer@sarh.ly',
            N'{"can_review":true,"can_approve":true}', 1);
GO

-- 3) Re-stamp the demo citizen's bcrypt hash to a known-good value so
--    seamless sign-in works for both demo accounts.
DECLARE @demo_auth_id UNIQUEIDENTIFIER = N'00000000-0000-0000-0000-000000000003';
DECLARE @demo_pwhash  NVARCHAR(120)    = N'$2b$10$i.29lD4qd2AoVEP5Z7keYeCvZHB/4DCE9QpowTKxCfOKQECN61SXa';

UPDATE auth_users
SET encrypted_password = @demo_pwhash,
    updated_at = SYSDATETIMEOFFSET()
WHERE id = @demo_auth_id;
GO
