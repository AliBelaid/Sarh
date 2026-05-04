-- =========================================================================
-- 011_audit.sql — append-only audit log (CLAUDE.md constraint #6)
-- =========================================================================

CREATE TYPE audit_action_enum AS ENUM (
    'create', 'update', 'delete', 'approve', 'reject',
    'issue_id', 'revoke_id', 'view', 'login'
);

CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    actor_kind    VARCHAR(16) NOT NULL,                -- 'officer' | 'citizen' | 'system'
    actor_id      UUID,
    action        audit_action_enum NOT NULL,
    entity_table  VARCHAR(64) NOT NULL,
    entity_id     UUID,
    before_state  JSONB,
    after_state   JSONB,
    ip_address    INET,
    user_agent    TEXT,
    occurred_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_table, entity_id);
CREATE INDEX idx_audit_actor  ON audit_log(actor_kind, actor_id);
CREATE INDEX idx_audit_time   ON audit_log(occurred_at DESC);

-- Enforce append-only at the DB layer (defense in depth — RLS in 015 also applies).
CREATE OR REPLACE FUNCTION trg_audit_log_append_only() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only — % blocked', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log_append_only();

CREATE TRIGGER tr_audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION trg_audit_log_append_only();
