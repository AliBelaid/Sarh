-- =========================================================================
-- 003_citizens.sql — citizens table + Arabic fulltext name search
-- =========================================================================
USE [sijilli];
GO

CREATE TABLE citizens (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    -- Names (الاسم الرباعي)
    first_name_ar            NVARCHAR(64)  NOT NULL,
    father_name_ar           NVARCHAR(64)  NOT NULL,
    grandfather_name_ar      NVARCHAR(64)  NOT NULL,
    family_name_ar           NVARCHAR(64)  NOT NULL,
    first_name_en            NVARCHAR(64)  NULL,
    father_name_en           NVARCHAR(64)  NULL,
    grandfather_name_en      NVARCHAR(64)  NULL,
    family_name_en           NVARCHAR(64)  NULL,
    mother_name_ar           NVARCHAR(192) NULL,
    -- Civil identity (legacy paper ID, optional)
    legacy_national_no       NVARCHAR(20)  NULL UNIQUE,
    family_book_no           NVARCHAR(20)  NULL,
    -- Personal
    gender                   NVARCHAR(8)   NOT NULL
        CONSTRAINT ck_citizens_gender CHECK (gender IN (N'male', N'female')),
    birth_date               DATE          NOT NULL,
    birth_place              NVARCHAR(96)  NULL,
    nationality              NVARCHAR(32)  NOT NULL DEFAULT N'Libyan',
    marital_status           NVARCHAR(16)  NULL
        CONSTRAINT ck_citizens_marital CHECK (marital_status IS NULL OR marital_status IN (N'single', N'married', N'divorced', N'widowed')),
    -- Contact
    phone                    NVARCHAR(20)  NULL UNIQUE,
    email                    NVARCHAR(120) NULL UNIQUE,
    -- Address
    region_id                INT           NULL REFERENCES regions(id),
    municipality_id          INT           NULL REFERENCES municipalities(id),
    address_ar               NVARCHAR(MAX) NULL,
    -- Media (storage paths)
    photo_path               NVARCHAR(255) NULL,
    signature_path           NVARCHAR(255) NULL,
    fingerprint_template     VARBINARY(MAX) NULL,
    -- Search helper (computed, persisted, indexed for fulltext)
    full_name_ar             AS (first_name_ar + N' ' + father_name_ar + N' ' + grandfather_name_ar + N' ' + family_name_ar) PERSISTED,
    -- System
    created_by               UNIQUEIDENTIFIER NULL,
    created_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at               DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    is_active                BIT NOT NULL DEFAULT 1
);
GO

CREATE INDEX idx_citizens_phone     ON citizens(phone);
CREATE INDEX idx_citizens_legacy_id ON citizens(legacy_national_no);
GO

-- Unique key required by fulltext index. The PK is already unique, but
-- fulltext needs a single-column non-null unique index.
CREATE UNIQUE INDEX ux_citizens_id_for_ft ON citizens(id);
GO

-- Arabic fulltext on the concatenated full name. Replaces pg_trgm GIN.
-- Skipped silently when SQL Server full-text feature isn't installed
-- (e.g. Express without the FullText component) — the citizens search
-- falls back to LIKE in that case.
IF EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'sijilli_ft')
   AND SERVERPROPERTY(N'IsFullTextInstalled') = 1
BEGIN
    BEGIN TRY
        EXEC(N'CREATE FULLTEXT INDEX ON citizens(full_name_ar LANGUAGE 1025)
              KEY INDEX ux_citizens_id_for_ft
              ON sijilli_ft
              WITH CHANGE_TRACKING AUTO;');
    END TRY
    BEGIN CATCH
        PRINT N'WARNING: fulltext index on citizens skipped — ' + ERROR_MESSAGE();
    END CATCH
END
ELSE
BEGIN
    PRINT N'WARNING: fulltext index on citizens skipped (FullText not installed)';
END
GO
