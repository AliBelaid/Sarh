-- =========================================================================
-- 008_workflow.sql — registration requests + reviewer comments
-- =========================================================================

CREATE TABLE registration_requests (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id              UUID NOT NULL REFERENCES properties(id),
    request_no               VARCHAR(20) UNIQUE NOT NULL,         -- human-friendly tracking no.
    submitted_by_citizen_id  UUID NOT NULL REFERENCES citizens(id),
    submitted_at             TIMESTAMPTZ DEFAULT NOW(),
    current_status           property_status_enum NOT NULL DEFAULT 'pending',
    notes                    TEXT
);

CREATE INDEX idx_reg_req_property ON registration_requests(property_id);
CREATE INDEX idx_reg_req_status   ON registration_requests(current_status);

CREATE TABLE review_comments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id  UUID NOT NULL REFERENCES properties(id),
    officer_id   UUID REFERENCES officers(id),
    citizen_id   UUID REFERENCES citizens(id),
    body         TEXT NOT NULL,
    is_internal  BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_comments_property ON review_comments(property_id);
