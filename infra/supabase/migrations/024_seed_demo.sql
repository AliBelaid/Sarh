-- =========================================================================
-- 024_seed_demo.sql — demo data for the mobile app's "Demo login" button.
--
-- Creates one Supabase Auth user (demo@sijilli.ly / Demo!12345) wired to a
-- citizen row + an active digital ID card. The mobile app's demo login
-- button POSTs to /auth/sign-in with these credentials.
--
-- Idempotent: safe to re-run. If you change the demo password or fields,
-- update both branches (UPDATE on conflict and the INSERT).
-- =========================================================================

DO $$
DECLARE
  v_demo_citizen_id UUID := '00000000-0000-0000-0000-000000000001';
  v_demo_card_id    UUID := '00000000-0000-0000-0000-000000000002';
  v_demo_auth_id    UUID := '00000000-0000-0000-0000-000000000003';
  v_demo_email      TEXT := 'demo@sijilli.ly';
  v_demo_password   TEXT := 'Demo!12345';
  v_demo_did_no     TEXT := 'LY-99-2026-000000-0';
BEGIN
  -- 1) Citizen row -------------------------------------------------------
  INSERT INTO citizens (
    id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar,
    gender, birth_date, nationality, region_id, is_active
  ) VALUES (
    v_demo_citizen_id,
    'مستخدم', 'تجريبي', 'صرح', 'ديمو',
    'male', DATE '1990-01-01', 'Libyan',
    -- Region 11 (Tripoli) is seeded by 016_seed_regions.sql.
    11, TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name_ar = EXCLUDED.first_name_ar,
    father_name_ar = EXCLUDED.father_name_ar,
    grandfather_name_ar = EXCLUDED.grandfather_name_ar,
    family_name_ar = EXCLUDED.family_name_ar,
    is_active = TRUE;

  -- 2) Digital ID card ---------------------------------------------------
  INSERT INTO digital_id_cards (
    id, citizen_id, digital_id_number, card_serial,
    issued_at, expires_at, status
  ) VALUES (
    v_demo_card_id,
    v_demo_citizen_id,
    v_demo_did_no,
    'DEMO-CARD-0001',
    NOW(),
    NOW() + INTERVAL '10 years',
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'active',
    expires_at = EXCLUDED.expires_at;

  -- 3) Supabase Auth user -----------------------------------------------
  -- service_role can write directly to auth.users. We use crypt() with a
  -- bcrypt salt — the same hash format Supabase Auth's API would produce.
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_demo_auth_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    v_demo_email,
    crypt(v_demo_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'sijilli_role', 'citizen',
      'citizen_id', v_demo_citizen_id::text,
      'provider', 'email',
      'providers', jsonb_build_array('email')
    ),
    jsonb_build_object('full_name_ar', 'مستخدم تجريبي ديمو'),
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = crypt(v_demo_password, gen_salt('bf')),
    raw_app_meta_data  = EXCLUDED.raw_app_meta_data,
    email_confirmed_at = NOW(),
    updated_at         = NOW();

  -- The corresponding identities row (Supabase Auth needs this for
  -- signInWithPassword to recognise the email/password provider).
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_demo_auth_id,
    jsonb_build_object('sub', v_demo_auth_id::text, 'email', v_demo_email),
    'email',
    v_demo_auth_id::text,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at    = NOW();
END $$;
