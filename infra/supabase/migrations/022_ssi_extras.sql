-- =========================================================================
-- 022_ssi_extras.sql — extra columns to track ACA-Py state on credentials.
-- =========================================================================
--
-- Phase 6 introduces real ACA-Py issuance, which is asynchronous: the
-- agent returns a `cred_ex_id` (credential exchange id) immediately and
-- transitions through 'offer_sent' → 'request_received' → 'credential_issued'
-- → 'credential_acked'. We persist that state on ssi_credentials so the
-- API can poll/recover. We also keep a free-text revoked_reason that
-- mirrors digital_id_cards.revoked_reason for consistency.

ALTER TABLE ssi_credentials
    ADD COLUMN IF NOT EXISTS cred_ex_id        VARCHAR(255),
    ADD COLUMN IF NOT EXISTS state             VARCHAR(64) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS revoked_reason    TEXT;

CREATE INDEX IF NOT EXISTS idx_ssi_credentials_cred_ex_id
    ON ssi_credentials(cred_ex_id);

CREATE INDEX IF NOT EXISTS idx_ssi_credentials_state
    ON ssi_credentials(state);

-- Track which sub-wallet a citizen has on the issuer agent. The
-- agent_token is short-lived (multitenancy JWT) and rotated; we store
-- the wallet_id (stable) and the latest token alongside.
ALTER TABLE ssi_wallets
    ADD COLUMN IF NOT EXISTS aca_py_wallet_id  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS aca_py_token      TEXT;

CREATE INDEX IF NOT EXISTS idx_ssi_wallets_aca_py_wallet
    ON ssi_wallets(aca_py_wallet_id);
