-- =========================================================================
-- 007_documents.sql — supporting documents uploaded for each property
-- =========================================================================
USE [sarh];
GO

CREATE TABLE property_documents (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_docs_property REFERENCES properties(id) ON DELETE CASCADE,
    document_type            NVARCHAR(32) NOT NULL
        CONSTRAINT ck_docs_type CHECK (document_type IN
            (N'koreky_certificate', N'survey_certificate', N'sale_contract', N'inheritance_deed',
             N'court_order', N'site_photo', N'boundary_map', N'other')),
    title_ar                 NVARCHAR(192) NULL,
    storage_path             NVARCHAR(255) NOT NULL,
    mime_type                NVARCHAR(64)  NULL,
    file_size_bytes          BIGINT        NULL,
    file_hash                CHAR(64)      NULL,
    uploaded_by_citizen_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_docs_uploader REFERENCES citizens(id),
    uploaded_at              DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_docs_property ON property_documents(property_id);
GO
