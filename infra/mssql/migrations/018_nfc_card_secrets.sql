-- =========================================================================
-- 018_nfc_card_secrets.sql — per-card NFC keys
--
-- Note vs Postgres version:
--  - last_nfc_counter / last_nfc_tap_at columns were already inlined into
--    004_digital_id.sql for SQL Server, so we don't ALTER them here.
--  - RLS is replaced by application-layer guards. The SUPABASE service
--    key model becomes the privileged-only DB user the API connects with.
-- =========================================================================
USE [sarh];
GO

CREATE TABLE nfc_card_secrets (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    card_id                  UNIQUEIDENTIFIER NOT NULL UNIQUE
        CONSTRAINT fk_nfc_secrets_card REFERENCES digital_id_cards(id) ON DELETE CASCADE,
    -- Encrypted key material (AES-256-GCM ciphertext + iv).
    meta_read_key_enc        VARBINARY(MAX) NOT NULL,
    meta_read_key_iv         VARBINARY(MAX) NOT NULL,
    sdm_file_read_key_enc    VARBINARY(MAX) NOT NULL,
    sdm_file_read_key_iv     VARBINARY(MAX) NOT NULL,
    kms_key_id               NVARCHAR(255) NOT NULL,
    wrap_alg                 NVARCHAR(32)  NOT NULL DEFAULT N'AES-256-GCM',
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    rotated_at               DATETIMEOFFSET(3) NULL
);
GO

CREATE INDEX idx_nfc_secrets_card ON nfc_card_secrets(card_id);
GO
