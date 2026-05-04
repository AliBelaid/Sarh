-- =========================================================================
-- 014_triggers.sql — updated_at auto-stamp
-- =========================================================================
USE [sijilli];
GO

-- One AFTER UPDATE trigger per table (SQL Server can't do FOR EACH ROW).
-- Each trigger only touches the changed row(s) and only writes updated_at.
CREATE OR ALTER TRIGGER tr_citizens_updated_at ON citizens
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE c SET updated_at = SYSDATETIMEOFFSET()
        FROM citizens c
        INNER JOIN inserted i ON i.id = c.id;
    END
END
GO

CREATE OR ALTER TRIGGER tr_digital_id_cards_updated_at ON digital_id_cards
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE d SET updated_at = SYSDATETIMEOFFSET()
        FROM digital_id_cards d
        INNER JOIN inserted i ON i.id = d.id;
    END
END
GO

CREATE OR ALTER TRIGGER tr_officers_updated_at ON officers
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE o SET updated_at = SYSDATETIMEOFFSET()
        FROM officers o
        INNER JOIN inserted i ON i.id = o.id;
    END
END
GO

CREATE OR ALTER TRIGGER tr_properties_updated_at ON properties
AFTER UPDATE
AS
BEGIN
    IF NOT UPDATE(updated_at)
    BEGIN
        UPDATE p SET updated_at = SYSDATETIMEOFFSET()
        FROM properties p
        INNER JOIN inserted i ON i.id = p.id;
    END
END
GO
