-- =========================================================================
-- 009_ssi.sql — SSI wallets and verifiable credentials (Hyperledger Aries)
-- =========================================================================

CREATE TABLE ssi_wallets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id      UUID NOT NULL UNIQUE REFERENCES citizens(id) ON DELETE CASCADE,
    did             VARCHAR(255) UNIQUE NOT NULL,
    public_key      TEXT NOT NULL,
    encrypted_seed  TEXT,
    agent_endpoint  VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ssi_credentials (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id          UUID NOT NULL REFERENCES ssi_wallets(id) ON DELETE CASCADE,
    credential_type    VARCHAR(64) NOT NULL,                -- 'DigitalId' | 'PropertyDeed'
    schema_id          VARCHAR(255),
    cred_def_id        VARCHAR(255),
    payload            JSONB NOT NULL,
    issued_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at         TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,
    revocation_reg_id  VARCHAR(255)
);

CREATE INDEX idx_ssi_credentials_wallet ON ssi_credentials(wallet_id);
CREATE INDEX idx_ssi_credentials_type   ON ssi_credentials(credential_type);
