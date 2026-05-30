-- =========================================================================
-- 042_registry_links.sql — paper-archive link + account/office foreign keys
-- =========================================================================
-- Closes three relational gaps the review committee will ask about:
--   1. properties.volume_number / page_number — ties a freshly-minted parcel
--      back to its row in the old paper real-estate register (volume + page).
--   2. auth_users.officer_id — the reverse link to the officer who owns the
--      account (officers.auth_user_id already points the other way; this makes
--      the join cheap from the account side and lets claims resolve directly).
--   3. digital_id_cards.issued_at_office_id — which branch (offices, 040)
--      printed the smart card.
-- =========================================================================
USE [sarh];
GO

-- ── 1. properties: old paper register coordinates ─────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.properties') AND name = N'volume_number')
BEGIN
    ALTER TABLE properties ADD volume_number NVARCHAR(50) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.properties') AND name = N'page_number')
BEGIN
    ALTER TABLE properties ADD page_number NVARCHAR(50) NULL;
END
GO

-- ── 2. auth_users.officer_id -> officers(id) ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.auth_users') AND name = N'officer_id')
BEGIN
    ALTER TABLE auth_users ADD officer_id UNIQUEIDENTIFIER NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_auth_users_officer')
BEGIN
    ALTER TABLE auth_users
        ADD CONSTRAINT fk_auth_users_officer
            FOREIGN KEY (officer_id) REFERENCES officers(id);
END
GO

-- Backfill from the existing reverse link so current accounts are wired.
UPDATE au
SET    au.officer_id = o.id
FROM   auth_users au
INNER  JOIN officers o ON o.auth_user_id = au.id
WHERE  au.officer_id IS NULL;
GO

-- One account ↔ one officer. Filtered unique index (NOT `NULL UNIQUE`, which
-- collides on two NULLs in SQL Server — see citizens/officers precedent).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_auth_users_officer')
BEGIN
    CREATE UNIQUE INDEX ux_auth_users_officer
        ON auth_users(officer_id)
        WHERE officer_id IS NOT NULL;
END
GO

-- ── 3. digital_id_cards.issued_at_office_id -> offices(id) ─────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.digital_id_cards') AND name = N'issued_at_office_id')
BEGIN
    ALTER TABLE digital_id_cards ADD issued_at_office_id INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'fk_did_cards_office')
BEGIN
    ALTER TABLE digital_id_cards
        ADD CONSTRAINT fk_did_cards_office
            FOREIGN KEY (issued_at_office_id) REFERENCES offices(id);
END
GO

PRINT N'042_registry_links.sql applied.';
GO
