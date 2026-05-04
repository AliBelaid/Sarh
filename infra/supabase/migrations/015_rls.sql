-- =========================================================================
-- 015_rls.sql — Row Level Security policies
-- =========================================================================

ALTER TABLE citizens                ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_id_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssi_wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssi_credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;

-- ---------- CITIZENS ----------
-- A citizen can read their own record (matched via JWT 'citizen_id' claim).
CREATE POLICY citizens_self_select ON citizens FOR SELECT
    USING (
        id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
    );

-- Active officers can read all citizen records (RBAC enforced at app layer too).
CREATE POLICY officers_read_citizens ON citizens FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

-- Officers can insert / update citizens (delete forbidden — soft delete only).
CREATE POLICY officers_write_citizens ON citizens FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );
CREATE POLICY officers_update_citizens ON citizens FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

-- ---------- DIGITAL ID CARDS ----------
CREATE POLICY did_cards_self_read ON digital_id_cards FOR SELECT
    USING (
        citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        OR EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

CREATE POLICY did_cards_officer_write ON digital_id_cards FOR ALL
    USING (
        EXISTS (SELECT 1 FROM officers o
                WHERE o.auth_user_id = auth.uid()
                  AND o.is_active
                  AND o.role IN ('id_issuer', 'super_admin'))
    );

-- ---------- PROPERTIES ----------
-- Citizens see + write their own properties.
CREATE POLICY properties_owner_all ON properties FOR ALL
    USING (
        owner_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
    )
    WITH CHECK (
        owner_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
    );

-- Officers see properties in their region (region scoping enforced at app layer).
CREATE POLICY properties_officer_read ON properties FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

CREATE POLICY properties_officer_review ON properties FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM officers o
                WHERE o.auth_user_id = auth.uid()
                  AND o.is_active
                  AND o.role IN ('registry_officer', 'reviewer', 'super_admin'))
    );

-- ---------- PROPERTY DOCUMENTS ----------
CREATE POLICY property_docs_owner ON property_documents FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM properties p
            WHERE p.id = property_documents.property_id
              AND p.owner_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        )
        OR EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

-- ---------- REGISTRATION REQUESTS ----------
CREATE POLICY reg_req_owner_read ON registration_requests FOR SELECT
    USING (
        submitted_by_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        OR EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

CREATE POLICY reg_req_owner_write ON registration_requests FOR INSERT
    WITH CHECK (
        submitted_by_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
    );

-- ---------- SSI WALLETS / CREDENTIALS ----------
CREATE POLICY ssi_wallet_self ON ssi_wallets FOR SELECT
    USING (
        citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        OR EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

CREATE POLICY ssi_credentials_self ON ssi_credentials FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ssi_wallets w
            WHERE w.id = ssi_credentials.wallet_id
              AND w.citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        )
        OR EXISTS (SELECT 1 FROM officers o WHERE o.auth_user_id = auth.uid() AND o.is_active)
    );

-- ---------- NOTIFICATIONS ----------
CREATE POLICY notifications_recipient ON notifications FOR SELECT
    USING (
        recipient_citizen_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'citizen_id')::uuid
        OR recipient_officer_id = (SELECT id FROM officers WHERE auth_user_id = auth.uid())
    );

-- ---------- AUDIT LOG ----------
-- Only auditors / super_admins can read.
CREATE POLICY audit_log_read ON audit_log FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM officers o
                WHERE o.auth_user_id = auth.uid()
                  AND o.is_active
                  AND o.role IN ('auditor', 'super_admin'))
    );

-- Inserts allowed for authenticated context (the application layer is the writer).
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
    WITH CHECK (true);
