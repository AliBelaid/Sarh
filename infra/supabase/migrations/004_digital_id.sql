-- =========================================================================
-- 004_digital_id.sql — digital ID cards + issuance history
-- =========================================================================

CREATE TYPE id_card_status_enum AS ENUM ('active', 'frozen', 'lost', 'expired', 'revoked');

CREATE TABLE digital_id_cards (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id               UUID NOT NULL REFERENCES citizens(id) ON DELETE CASCADE,
    -- Format: LY-RR-YYYY-SSSSSS-C
    digital_id_number        VARCHAR(24) NOT NULL UNIQUE,
    -- Card physical
    card_serial              VARCHAR(32) NOT NULL UNIQUE,        -- printed on the card
    nfc_uid                  VARCHAR(32) UNIQUE,                  -- NTAG 424 DNA UID (hex)
    nfc_signature_key_id     VARCHAR(64),                         -- KMS key ref
    -- SSI / DID
    did                      VARCHAR(255) UNIQUE,                 -- did:sov:LY:xxxx
    did_doc                  JSONB,
    wallet_endpoint          VARCHAR(255),
    -- Lifecycle
    issued_at                TIMESTAMPTZ DEFAULT NOW(),
    issued_by_officer_id     UUID,
    expires_at               TIMESTAMPTZ NOT NULL,
    status                   id_card_status_enum NOT NULL DEFAULT 'active',
    revoked_at               TIMESTAMPTZ,
    revoked_reason           TEXT,
    -- Hashes (tamper protection)
    photo_hash               CHAR(64),                            -- sha256 of photo
    data_hash                CHAR(64),                            -- sha256 of canonical data
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_did_cards_citizen ON digital_id_cards(citizen_id);
CREATE INDEX idx_did_cards_status  ON digital_id_cards(status);

CREATE TABLE id_issuance_history (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id   UUID NOT NULL REFERENCES citizens(id),
    card_id      UUID REFERENCES digital_id_cards(id),
    action       VARCHAR(32) NOT NULL,    -- issued / re-issued / frozen / revoked
    reason       TEXT,
    officer_id   UUID,
    occurred_at  TIMESTAMPTZ DEFAULT NOW()
);
