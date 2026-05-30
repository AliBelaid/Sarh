-- =========================================================================
-- 040_offices.sql — registry branches / ID-issuance offices lookup
-- =========================================================================
-- Where physical work happens: a registry branch, an ID-issuance station,
-- etc. Smart cards (digital_id_cards) are printed at one of these offices,
-- so 042 adds digital_id_cards.issued_at_office_id -> offices(id). INT
-- IDENTITY PK to match the other lookup tables (regions / municipalities).
-- =========================================================================
USE [sarh];
GO

CREATE TABLE offices (
    id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    code            NVARCHAR(16)  NOT NULL UNIQUE,
    name_ar         NVARCHAR(128) NOT NULL,
    name_en         NVARCHAR(128) NULL,
    office_type     NVARCHAR(24)  NOT NULL DEFAULT N'registry'
        CONSTRAINT ck_offices_type CHECK (office_type IN
            (N'registry', N'id_issuance', N'headquarters', N'mixed')),
    region_id       INT NULL REFERENCES regions(id),
    municipality_id INT NULL REFERENCES municipalities(id),
    address_ar      NVARCHAR(256) NULL,
    phone           NVARCHAR(32)  NULL,
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_offices_region ON offices(region_id);
GO

-- updated_at auto-stamp (same pattern as 014_triggers.sql).
CREATE OR ALTER TRIGGER tr_offices_updated_at ON offices
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE o SET updated_at = SYSDATETIMEOFFSET()
        FROM offices o
        INNER JOIN inserted i ON i.id = o.id;
    END
END
GO

-- Minimal seed so the FK in 042 and the issuer station have something to
-- point at. region_id left NULL to stay robust against region seed ordering;
-- demo/admin tooling fills the geography later.
INSERT INTO offices (code, name_ar, name_en, office_type)
VALUES
    (N'HQ-TRP',  N'المقر الرئيسي - طرابلس',        N'Headquarters - Tripoli',        N'headquarters'),
    (N'REG-TRP', N'مكتب السجل العقاري - طرابلس',   N'Registry Office - Tripoli',     N'registry'),
    (N'ID-TRP',  N'محطة إصدار الهوية - طرابلس',    N'ID Issuance Station - Tripoli', N'id_issuance'),
    (N'REG-BEN', N'مكتب السجل العقاري - بنغازي',   N'Registry Office - Benghazi',    N'registry');
GO

PRINT N'040_offices.sql applied.';
GO
