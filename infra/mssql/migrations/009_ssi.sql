-- =========================================================================
-- 009_ssi.sql — SSI wallets and verifiable credentials (Hyperledger Aries)
-- =========================================================================
USE [sarh];
GO

CREATE TABLE ssi_wallets (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    citizen_id      UNIQUEIDENTIFIER NOT NULL UNIQUE
        CONSTRAINT fk_ssi_wallet_citizen REFERENCES citizens(id) ON DELETE CASCADE,
    did             NVARCHAR(255) NOT NULL UNIQUE,
    public_key      NVARCHAR(MAX) NOT NULL,
    encrypted_seed  NVARCHAR(MAX) NULL,
    agent_endpoint  NVARCHAR(255) NULL,
    created_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE TABLE ssi_credentials (
    id                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    wallet_id          UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_ssi_cred_wallet REFERENCES ssi_wallets(id) ON DELETE CASCADE,
    credential_type    NVARCHAR(64)  NOT NULL,
    schema_id          NVARCHAR(255) NULL,
    cred_def_id        NVARCHAR(255) NULL,
    payload            NVARCHAR(MAX) NOT NULL
        CONSTRAINT ck_ssi_cred_payload_json CHECK (ISJSON(payload) = 1),
    issued_at          DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    expires_at         DATETIMEOFFSET(3) NULL,
    revoked_at         DATETIMEOFFSET(3) NULL,
    revocation_reg_id  NVARCHAR(255) NULL
);
GO

CREATE INDEX idx_ssi_credentials_wallet ON ssi_credentials(wallet_id);
CREATE INDEX idx_ssi_credentials_type   ON ssi_credentials(credential_type);
GO
