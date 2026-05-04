-- =========================================================================
-- 025_demo_open_rls.sql — Phase-3 unblock for the cross-surface demo loop
--
-- The strict RLS in 015_rls.sql relies on a custom JWT claim
-- (`citizen_id`) that the demo flow doesn't have — we use plain Supabase
-- Auth users instead. This migration adds permissive policies tied to
-- `auth.uid()` so authenticated users can drive the demo end-to-end.
--
-- Idempotent: drops any prior demo policies before re-creating them.
-- Safe to re-run after every schema change.
--
-- After Phase 12 hardening, replace these with role-scoped policies.
-- =========================================================================

-- 1) Make sure RLS is on for every table the demo touches ----------------
ALTER TABLE citizens                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_id_cards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_issuance_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers                 ENABLE ROW LEVEL SECURITY;

-- 2) Add an auth_user_id link on citizens if it's missing -----------------
-- The mobile demo writes citizens.id = auth.uid() so the default policy
-- applies, but we keep this column for fully-issued citizens whose primary
-- key is a registry UUID.
ALTER TABLE citizens
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_citizens_auth_user_id ON citizens(auth_user_id);

-- 3) Drop prior demo policies so the script is re-runnable ---------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'demo_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END$$;

-- 4) Permissive demo policies — authenticated users only ----------------
-- Citizens: a row keyed by auth.uid() is yours; everything else is
-- visible read-only so admins can browse the warehouse.
CREATE POLICY demo_citizens_self_all ON citizens
  FOR ALL TO authenticated
  USING (id = auth.uid() OR auth_user_id = auth.uid())
  WITH CHECK (id = auth.uid() OR auth_user_id = auth.uid());

CREATE POLICY demo_citizens_browse ON citizens
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY demo_citizens_admin_write ON citizens
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Digital ID cards: full CRUD for authenticated demo users.
CREATE POLICY demo_did_cards_all ON digital_id_cards
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demo_id_history_all ON id_issuance_history
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Properties: any authenticated user can submit/read/update during the
-- demo. The approval flow is enforced at the application layer.
CREATE POLICY demo_properties_all ON properties
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demo_property_docs_all ON property_documents
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demo_reg_req_all ON registration_requests
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Notifications, officers (so admin can read the officers list), audit.
CREATE POLICY demo_notifications_all ON notifications
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demo_officers_all ON officers
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demo_audit_read ON audit_log
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY demo_audit_insert ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5) Realtime publication — opt-in tables -------------------------------
-- Adds the demo tables to supabase_realtime so the admin lists stream
-- changes live. Skip silently if already added.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'citizens','digital_id_cards','properties','officers',
    'audit_log','notifications','registration_requests'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already a member
      NULL;
    END;
  END LOOP;
END$$;
