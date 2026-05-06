-- =========================================================================
-- 028_property_nfts_ownership_history.sql
--
-- On-chain property licence support. Each approved property may be tokenised
-- as an NFT (ERC-721 on Ethereum, or chaincode on Hyperledger Fabric). The
-- property_nfts row is the system-of-record link between the registry's
-- internal property and its on-chain identity. ownership_history is an
-- append-only chain of custody (initial mint + every transfer).
--
-- Design note: ownership of a parcel is still legally tracked by
-- properties.owner_citizen_id; the NFT is a verifiable mirror, not a
-- replacement. Updates to owner_citizen_id MUST also INSERT an
-- ownership_history row (enforced at the service layer, not by trigger,
-- because the from/to DIDs aren't derivable from citizens alone).
--
-- See docs/diagrams/conceptual-erd.mmd, db-schema.mmd, class-diagram.mmd
-- and sequence-property-approval.mmd for the full design.
-- =========================================================================
USE [sarh];
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── 1. Extend the officer role list with department_manager. ──────────────
-- This is the third human role: sits between reviewer (technical
-- recommendation) and super_admin. Final approval + NFT mint trigger.
ALTER TABLE officers DROP CONSTRAINT ck_officers_role;
GO
ALTER TABLE officers ADD CONSTRAINT ck_officers_role
    CHECK (role IN (
        N'super_admin',
        N'registry_officer',
        N'id_issuer',
        N'auditor',
        N'reviewer',
        N'department_manager'
    ));
GO

-- ── 2. Extend property statuses for the post-approval NFT lifecycle. ──────
-- 'approved' is the legacy terminal state; 'minted' = NFT successfully
-- written to chain; 'transferred' = ownership has moved at least once
-- since the initial mint.
ALTER TABLE properties DROP CONSTRAINT ck_properties_status;
GO
ALTER TABLE properties ADD CONSTRAINT ck_properties_status
    CHECK (status IN (
        N'draft',
        N'pending',
        N'under_review',
        N'approved',
        N'rejected',
        N'needs_clarification',
        N'frozen',
        N'minted',
        N'transferred'
    ));
GO

-- ── 3. Manager final-approval link on properties. ─────────────────────────
ALTER TABLE properties ADD
    approved_by_manager_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_properties_manager REFERENCES officers(id),
    final_approved_at        DATETIMEOFFSET(3) NULL;
GO

-- ── 4. property_nfts ──────────────────────────────────────────────────────
CREATE TABLE property_nfts (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_nft_property REFERENCES properties(id),
    -- Token identity. token_id is uint256 on EVM; stored as text to avoid
    -- numeric overflow and to stay portable to Hyperledger which uses an
    -- arbitrary string asset id.
    token_id                 NVARCHAR(80)   NOT NULL,
    contract_address         NVARCHAR(80)   NOT NULL,
    network                  NVARCHAR(40)   NOT NULL
        CONSTRAINT ck_nft_network CHECK (network IN (
            N'ethereum-mainnet', N'ethereum-sepolia',
            N'polygon-mainnet',  N'polygon-amoy',
            N'hyperledger-fabric'
        )),
    standard                 NVARCHAR(24)   NOT NULL
        CONSTRAINT ck_nft_standard CHECK (standard IN (N'ERC-721', N'ERC-1155', N'chaincode'))
        DEFAULT N'ERC-721',
    -- Owner identity at the time of mint / latest known on-chain state.
    -- We always pair the W3C DID (off-chain identity) with the on-chain
    -- address so SSI verifications stay valid even after wallet rotation.
    owner_did                NVARCHAR(160)  NOT NULL,
    owner_address            NVARCHAR(80)   NULL,
    -- Token metadata (stored off-chain, hash anchored on-chain via tokenURI).
    metadata_uri             NVARCHAR(255)  NOT NULL,
    metadata_sha256          CHAR(64)       NOT NULL,
    -- Mint provenance.
    mint_tx_hash             NVARCHAR(80)   NOT NULL,
    mint_block_number        BIGINT         NULL,
    minted_by_officer_id     UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_nft_minter REFERENCES officers(id),
    minted_at                DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- Lifecycle.
    status                   NVARCHAR(16)   NOT NULL DEFAULT N'pending'
        CONSTRAINT ck_nft_status CHECK (status IN
            (N'pending', N'minted', N'transferred', N'burned', N'failed')),
    -- Last on-chain reconciliation (filled by the periodic event-poller).
    last_reconciled_at       DATETIMEOFFSET(3) NULL,
    -- System.
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

-- One NFT per property is the registry rule (re-mint requires burn-then-mint
-- with an explicit court order; that path doesn't exist yet in the API).
CREATE UNIQUE INDEX ux_nft_property
    ON property_nfts(property_id)
    WHERE status IN (N'pending', N'minted', N'transferred');
-- Token id is unique within a (network, contract) pair.
CREATE UNIQUE INDEX ux_nft_token
    ON property_nfts(network, contract_address, token_id);
CREATE INDEX idx_nft_owner_did
    ON property_nfts(owner_did);
CREATE INDEX idx_nft_status
    ON property_nfts(status);
GO

-- ── 5. ownership_history ──────────────────────────────────────────────────
-- Append-only chain of custody. The first row for an NFT has from_did=NULL
-- and reason='initial_mint'. Subsequent rows record sales, inheritance,
-- court-ordered transfers, etc. INSERT-only is enforced via a trigger
-- pattern reused from audit_log (see 011_audit.sql).
CREATE TABLE ownership_history (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_oh_property REFERENCES properties(id),
    nft_id                   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_oh_nft REFERENCES property_nfts(id),
    from_did                 NVARCHAR(160)  NULL,
    to_did                   NVARCHAR(160)  NOT NULL,
    from_citizen_id          UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_oh_from_citizen REFERENCES citizens(id),
    to_citizen_id            UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_oh_to_citizen REFERENCES citizens(id),
    transfer_tx_hash         NVARCHAR(80)   NULL,
    transfer_block_number    BIGINT         NULL,
    reason                   NVARCHAR(32)   NOT NULL
        CONSTRAINT ck_oh_reason CHECK (reason IN (
            N'initial_mint', N'sale', N'inheritance',
            N'gift', N'court_order', N'correction'
        )),
    notes_ar                 NVARCHAR(MAX)  NULL,
    -- Officer who recorded the transfer in the registry (NULL for
    -- citizen-initiated transfers, set for officer-mediated ones).
    recorded_by_officer_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_oh_recorder REFERENCES officers(id),
    transferred_at           DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_oh_property      ON ownership_history(property_id);
CREATE INDEX idx_oh_nft           ON ownership_history(nft_id);
CREATE INDEX idx_oh_to_citizen    ON ownership_history(to_citizen_id);
CREATE INDEX idx_oh_from_citizen  ON ownership_history(from_citizen_id);
GO

-- Append-only: block UPDATE / DELETE the same way audit_log does.
CREATE OR ALTER TRIGGER tr_ownership_history_no_update
ON ownership_history
INSTEAD OF UPDATE AS
BEGIN
    RAISERROR(N'ownership_history is append-only; UPDATE is not permitted.', 16, 1);
END
GO

CREATE OR ALTER TRIGGER tr_ownership_history_no_delete
ON ownership_history
INSTEAD OF DELETE AS
BEGIN
    RAISERROR(N'ownership_history is append-only; DELETE is not permitted.', 16, 1);
END
GO

-- ── 6. updated_at trigger for property_nfts (matches the convention from
-- 014_triggers.sql for every other table). ownership_history is INSERT-only
-- so it has no updated_at column and needs no trigger.
CREATE OR ALTER TRIGGER tr_property_nfts_updated_at ON property_nfts
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE n SET updated_at = SYSDATETIMEOFFSET()
        FROM property_nfts n
        INNER JOIN inserted i ON i.id = n.id;
    END
END
GO

PRINT N'028_property_nfts_ownership_history.sql applied.';
GO
