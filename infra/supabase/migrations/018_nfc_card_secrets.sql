-- =========================================================================
-- 018_nfc_card_secrets.sql — per-card NFC keys + replay-counter column
-- =========================================================================
--
-- The NTAG 424 DNA chip needs two AES-128 keys:
--   - meta_read_key (K2): encrypts the PICC data (UID + counter) embedded
--     in the SUN URL.
--   - sdm_file_read_key: used to derive the per-tap session CMAC key
--     (SV2 derivation, see NXP AN12196).
--
-- Both keys are generated server-side at issuance, returned ONCE to the
-- issuer station for writing to the chip, then persisted here encrypted
-- with KMS_MASTER_KEY (AES-256-GCM). Production swaps the local
-- encryption for a real KMS-managed key without changing this schema.
--
-- The card row itself only carries a key pointer (digital_id_cards
-- .nfc_signature_key_id, defined in 004_digital_id.sql). The pointer is
-- the FK target id below; the row never leaves the server.

CREATE TABLE nfc_card_secrets (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id                  UUID NOT NULL UNIQUE
                                REFERENCES digital_id_cards(id) ON DELETE CASCADE,
    -- Encrypted key material (AES-256-GCM ciphertext + tag + iv).
    meta_read_key_enc        BYTEA NOT NULL,
    meta_read_key_iv         BYTEA NOT NULL,
    sdm_file_read_key_enc    BYTEA NOT NULL,
    sdm_file_read_key_iv     BYTEA NOT NULL,
    -- KMS key reference (e.g. "local:v1" in dev, "aws:arn:..." in prod).
    kms_key_id               VARCHAR(255) NOT NULL,
    -- Algorithm used to encrypt the per-card keys above.
    wrap_alg                 VARCHAR(32)  NOT NULL DEFAULT 'AES-256-GCM',
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    rotated_at               TIMESTAMPTZ
);

CREATE INDEX idx_nfc_secrets_card ON nfc_card_secrets(card_id);

-- Replay protection. The chip emits a monotonically increasing 3-byte
-- counter with every tap. We persist the highest one we've seen and
-- reject any value <= it. NULL on a fresh card; populated on first tap.
ALTER TABLE digital_id_cards
    ADD COLUMN last_nfc_counter INT,
    ADD COLUMN last_nfc_tap_at  TIMESTAMPTZ;

-- NFC secrets are extremely sensitive — RLS on, no direct access.
-- Only the API (service role) reads or writes this table.
ALTER TABLE nfc_card_secrets ENABLE ROW LEVEL SECURITY;
-- (No SELECT/INSERT/UPDATE policies = no one but service-role can touch it.)
