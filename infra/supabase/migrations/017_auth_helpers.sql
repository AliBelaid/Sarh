-- =========================================================================
-- 017_auth_helpers.sql — RPC + helper used by the Auth Hook to inject
-- custom Sijilli claims into the JWT at sign-in time.
-- =========================================================================

-- Returns a JSON object suitable for merging into the access token's
-- claims. Resolves the caller from auth.uid via the officers table; if no
-- officer match, treats the user as a citizen (citizen_id is read from
-- auth.users.app_metadata since citizens don't carry auth_user_id).
CREATE OR REPLACE FUNCTION sijilli_auth_claims(p_auth_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_officer    RECORD;
    v_citizen_id UUID;
    v_metadata   JSONB;
BEGIN
    SELECT id, role, region_id, municipality_id, permissions, is_active
    INTO v_officer
    FROM officers
    WHERE auth_user_id = p_auth_user_id;

    IF FOUND AND v_officer.is_active THEN
        RETURN jsonb_build_object(
            'sijilli_role',   v_officer.role::text,
            'officer_id',     v_officer.id::text,
            'region_id',      v_officer.region_id,
            'municipality_id', v_officer.municipality_id,
            'permissions',    coalesce(v_officer.permissions, '{}'::jsonb)
        );
    END IF;

    SELECT raw_app_meta_data INTO v_metadata
    FROM auth.users
    WHERE id = p_auth_user_id;

    IF v_metadata IS NOT NULL AND v_metadata ? 'citizen_id' THEN
        v_citizen_id := (v_metadata->>'citizen_id')::uuid;
        RETURN jsonb_build_object(
            'sijilli_role', 'citizen',
            'citizen_id',   v_citizen_id::text
        );
    END IF;

    -- Unknown identity — return an empty claim set so the JWT is still
    -- emitted but the API guard will reject it.
    RETURN '{}'::jsonb;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Allow the Supabase Auth service to invoke this function. The Auth Hook
-- runs as an Edge Function with the service-role key, so it can call this.
GRANT EXECUTE ON FUNCTION sijilli_auth_claims(UUID) TO service_role;
