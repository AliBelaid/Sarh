-- =========================================================================
-- 033_seed_card_pins.sql — wire up demo digital-ID PINs + auth_user link.
--
-- Mobile login uses POST /api/v1/auth/sign-in-with-pin which looks up a
-- card by its digital_id_number, verifies the PIN against `pin_hash`, and
-- resolves the citizen → auth_user for the JWT subject.
--
-- Two things this migration does:
--   1. Sets `citizens.auth_user_id` for ahmed (101 → 111) and fatima
--      (102 → 112) so the JWT can use the same auth_user as web sign-in.
--   2. Seeds bcrypt('123456', 10) into pin_hash for both demo cards so a
--      developer can immediately try mobile login.
--
-- The PIN hash itself is written by the DbSeeder hosted service on every
-- API boot (EnsureDemoPinHashesAsync) using BCrypt.Net-Next, so we don't
-- ship a hard-coded hash here.
-- =========================================================================
USE [sarh];
GO

UPDATE citizens SET auth_user_id = N'00000000-0000-0000-0000-000000000111'
 WHERE id = N'00000000-0000-0000-0000-000000000101' AND auth_user_id IS NULL;
UPDATE citizens SET auth_user_id = N'00000000-0000-0000-0000-000000000112'
 WHERE id = N'00000000-0000-0000-0000-000000000102' AND auth_user_id IS NULL;
GO
