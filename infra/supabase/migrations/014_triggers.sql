-- =========================================================================
-- 014_triggers.sql — updated_at auto-stamp
-- =========================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['citizens','digital_id_cards','officers','properties'])
    LOOP
        EXECUTE format(
            'CREATE TRIGGER tr_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();',
            t, t
        );
    END LOOP;
END $$;
