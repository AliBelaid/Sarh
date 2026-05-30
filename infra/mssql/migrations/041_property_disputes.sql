-- =========================================================================
-- 041_property_disputes.sql — legal disputes / liens / seizures on parcels
-- =========================================================================
-- Real estate carries legal encumbrances: a parcel may be under a court
-- seizure, mortgaged to a bank (e.g. the Real Estate Bank), under an
-- inheritance dispute, or constituted as a waqf. If the registry let a
-- citizen sell — or the system mint an NFT for — an encumbered parcel, that
-- is a security failure. This table records each encumbrance; an *active*
-- row blocks both the transfer (sale) and mint paths at the service layer
-- until the encumbrance is lifted (status -> 'lifted').
--
-- Per CLAUDE.md convention the dispute_type / status are latin CHECK codes
-- (the API maps them to Arabic for display); the human detail lives in notes.
-- =========================================================================
USE [sarh];
GO

CREATE TABLE property_disputes (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_disputes_property REFERENCES properties(id),
    -- Kind of encumbrance. Display strings (حجز قضائي، رهن مصدّق، نزاع ورثة،
    -- وقف، حجز تحفظي) are resolved in the API from these codes.
    dispute_type             NVARCHAR(40) NOT NULL
        CONSTRAINT ck_disputes_type CHECK (dispute_type IN
            (N'judicial_seizure',      -- حجز قضائي
             N'certified_mortgage',    -- رهن مصدّق
             N'inheritance_dispute',   -- نزاع ورثة
             N'waqf',                  -- وقف
             N'precautionary_seizure', -- حجز تحفظي
             N'other')),
    case_number              NVARCHAR(50)  NULL,
    issuing_authority        NVARCHAR(150) NOT NULL,   -- محكمة طرابلس، مصرف ليبيا المركزي…
    start_date               DATE          NOT NULL,
    end_date                 DATE          NULL,
    status                   NVARCHAR(24)  NOT NULL DEFAULT N'active'
        CONSTRAINT ck_disputes_status CHECK (status IN (N'active', N'lifted')),
    notes                    NVARCHAR(MAX) NULL,
    recorded_by_officer_id   UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_disputes_officer REFERENCES officers(id),
    -- Who lifted it + when (set when status flips to 'lifted').
    lifted_by_officer_id     UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_disputes_lifter REFERENCES officers(id),
    lifted_at                DATETIMEOFFSET(3) NULL,
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT ck_disputes_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
GO

CREATE INDEX idx_disputes_property ON property_disputes(property_id);
-- Hot path: "does this parcel have an active encumbrance?" — filtered so the
-- block check on mint/transfer is a tiny seek.
CREATE INDEX idx_disputes_active
    ON property_disputes(property_id)
    WHERE status = N'active';
GO

-- updated_at auto-stamp (same pattern as 014_triggers.sql).
CREATE OR ALTER TRIGGER tr_property_disputes_updated_at ON property_disputes
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE d SET updated_at = SYSDATETIMEOFFSET()
        FROM property_disputes d
        INNER JOIN inserted i ON i.id = d.id;
    END
END
GO

PRINT N'041_property_disputes.sql applied.';
GO
