-- =========================================================================
-- 032_drop_did_cards_rls.sql — disable the legacy digital_id_cards RLS policy.
--
-- 015_rls.sql created `sec_did_cards` to filter cards based on
-- SESSION_CONTEXT('sarh.citizen_id') / officer-role. The .NET 8 API does
-- NOT set those session-context variables — instead it enforces the same
-- rule in C# (DigitalIdCardsService.ListAsync filters by actor.CitizenId
-- when the actor isn't an officer, and OfficerOnly attributes gate writes).
--
-- Because no session context is set, the FILTER PREDICATE evaluates false
-- for every row and returns an empty list to the API. The seed cards are
-- there but invisible.
--
-- Drop the policy so the application-layer enforcement is the sole gate.
-- Idempotent.
-- =========================================================================
USE [sarh];
GO

IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'sec_did_cards')
BEGIN
    DROP SECURITY POLICY sec_did_cards;
END
GO
