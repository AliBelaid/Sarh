-- =========================================================================
-- 038_property_nfts_minter_nullable.sql — allow citizen-driven NFT mint.
--
-- Final-approve (POST /api/v1/properties/{id}/final-approve) is now open
-- to any authenticated role, not just department_manager / super_admin.
-- When a citizen mints their own already-approved property, there is no
-- officer to record in `property_nfts.minted_by_officer_id`, so the column
-- must accept NULL.
--
-- The fk_nft_minter foreign key stays in place — NULL is a valid FK value.
--
-- Idempotent: the ALTER COLUMN is a no-op once nullable.
-- =========================================================================
USE [sarh];
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.property_nfts')
      AND name = 'minted_by_officer_id'
      AND is_nullable = 0)
BEGIN
    ALTER TABLE property_nfts
        ALTER COLUMN minted_by_officer_id UNIQUEIDENTIFIER NULL;
END
GO
