-- =========================================================================
-- 010_notifications.sql — outbound notification queue
-- =========================================================================

CREATE TYPE notification_kind_enum AS ENUM ('sms', 'push', 'email', 'in_app');

CREATE TABLE notifications (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_citizen_id     UUID REFERENCES citizens(id),
    recipient_officer_id     UUID REFERENCES officers(id),
    kind                     notification_kind_enum NOT NULL,
    title_ar                 VARCHAR(192),
    body_ar                  TEXT,
    payload                  JSONB,
    sent_at                  TIMESTAMPTZ DEFAULT NOW(),
    read_at                  TIMESTAMPTZ,
    delivery_status          VARCHAR(32) DEFAULT 'queued'
);

CREATE INDEX idx_notifications_citizen ON notifications(recipient_citizen_id);
CREATE INDEX idx_notifications_officer ON notifications(recipient_officer_id);
CREATE INDEX idx_notifications_status  ON notifications(delivery_status);
