-- =========================================================================
-- 010_notifications.sql — outbound notification queue
-- =========================================================================
USE [sarh];
GO

CREATE TABLE notifications (
    id                       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    recipient_citizen_id     UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_notifications_citizen REFERENCES citizens(id),
    recipient_officer_id     UNIQUEIDENTIFIER NULL
        CONSTRAINT fk_notifications_officer REFERENCES officers(id),
    kind                     NVARCHAR(16) NOT NULL
        CONSTRAINT ck_notifications_kind CHECK (kind IN (N'sms', N'push', N'email', N'in_app')),
    title_ar                 NVARCHAR(192) NULL,
    body_ar                  NVARCHAR(MAX) NULL,
    payload                  NVARCHAR(MAX) NULL
        CONSTRAINT ck_notifications_payload_json CHECK (payload IS NULL OR ISJSON(payload) = 1),
    sent_at                  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    read_at                  DATETIMEOFFSET(3) NULL,
    delivery_status          NVARCHAR(32) NOT NULL DEFAULT N'queued'
);
GO

CREATE INDEX idx_notifications_citizen ON notifications(recipient_citizen_id);
CREATE INDEX idx_notifications_officer ON notifications(recipient_officer_id);
CREATE INDEX idx_notifications_status  ON notifications(delivery_status);
GO
