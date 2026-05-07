-- =========================================================================
-- 008_workflow.sql — registration requests + reviewer comments
-- =========================================================================
USE [sarh];
GO

CREATE TABLE registration_requests (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id              UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_reg_req_property REFERENCES properties(id),
    request_no               NVARCHAR(20) NOT NULL UNIQUE,
    submitted_by_citizen_id  UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_reg_req_citizen REFERENCES citizens(id),
    submitted_at             DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    current_status           NVARCHAR(24) NOT NULL DEFAULT N'pending'
        CONSTRAINT ck_reg_req_status CHECK (current_status IN
            (N'draft', N'pending', N'under_review', N'approved', N'rejected', N'needs_clarification', N'frozen')),
    notes                    NVARCHAR(MAX) NULL
);
GO

CREATE INDEX idx_reg_req_property ON registration_requests(property_id);
CREATE INDEX idx_reg_req_status   ON registration_requests(current_status);
GO

CREATE TABLE review_comments (
    id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    property_id  UNIQUEIDENTIFIER NOT NULL
        CONSTRAINT fk_review_property REFERENCES properties(id),
    officer_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_review_officer REFERENCES officers(id),
    citizen_id   UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_review_citizen REFERENCES citizens(id),
    body         NVARCHAR(MAX) NOT NULL,
    is_internal  BIT NOT NULL DEFAULT 0,
    created_at   DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

CREATE INDEX idx_review_comments_property ON review_comments(property_id);
GO
