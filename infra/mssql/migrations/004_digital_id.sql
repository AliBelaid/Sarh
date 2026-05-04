-- =========================================================================
-- 004_digital_id.sql — digital ID cards + issuance history
-- =========================================================================
USE [sijilli];
GO

CREATE TABLE digital_id_cards (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    citizen_id               UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_did_cards_citizen REFERENCES citizens(id) ON DELETE CASCADE,
    digital_id_number        NVARCHAR(24)  NOT NULL UNIQUE,
    card_serial              NVARCHAR(32)  NOT NULL UNIQUE,
    nfc_uid                  NVARCHAR(32)  NULL UNIQUE,
    nfc_signature_key_id     NVARCHAR(64)  NULL,
    -- Replay protection for SUN taps (NTAG 424 DNA SDM counter).
    last_nfc_counter         BIGINT        NOT NULL DEFAULT 0,
    last_nfc_tap_at          DATETIMEOFFSET(3) NULL,
    -- SSI / DID
    did                      NVARCHAR(255) NULL UNIQUE,
    did_doc                  NVARCHAR(MAX) NULL CONSTRAINT ck_did_cards_did_doc_json CHECK (did_doc IS NULL OR ISJSON(did_doc) = 1),
    wallet_endpoint          NVARCHAR(255) NULL,
    -- Lifecycle
    issued_at                DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    issued_by_officer_id     UNIQUEIDENTIFIER NULL,
    expires_at               DATETIMEOFFSET(3) NOT NULL,
    status                   NVARCHAR(16)  NOT NULL DEFAULT N'active'
        CONSTRAINT ck_did_cards_status CHECK (status IN (N'active', N'frozen', N'lost', N'expired', N'revoked')),
    revoked_at               DATETIMEOFFSET(3) NULL,
    revoked_reason           NVARCHAR(MAX) NULL,
    -- Hashes (tamper protection)
    photo_hash               CHAR(64)      NULL,
    data_hash                CHAR(64)      NULL,
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_did_cards_citizen ON digital_id_cards(citizen_id);
CREATE INDEX idx_did_cards_status  ON digital_id_cards(status);
GO

CREATE TABLE id_issuance_history (
    id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    citizen_id   UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_id_iss_citizen REFERENCES citizens(id),
    card_id      UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_id_iss_card REFERENCES digital_id_cards(id),
    action       NVARCHAR(32)  NOT NULL,
    reason       NVARCHAR(MAX) NULL,
    officer_id   UNIQUEIDENTIFIER NULL,
    occurred_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO
