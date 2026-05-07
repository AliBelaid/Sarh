-- =========================================================================
-- 031_digital_id_pin.sql — add a 6-digit PIN to every digital ID card.
--
-- Stored as a bcrypt hash (`pin_hash`) so we never persist the plaintext.
-- Reset via POST /api/v1/digital-id-cards/{id}/reset-pin which generates a
-- fresh random PIN, hashes it, and returns the plaintext exactly once for
-- the issuer to print on the card receipt or hand to the citizen.
--
-- Idempotent — only adds the column if missing.
-- =========================================================================
USE [sarh];
GO

IF COL_LENGTH('digital_id_cards', 'pin_hash') IS NULL
BEGIN
    ALTER TABLE digital_id_cards
        ADD pin_hash NVARCHAR(120) NULL,
            pin_set_at DATETIMEOFFSET(3) NULL;
END
GO
