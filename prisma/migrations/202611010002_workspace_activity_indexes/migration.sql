CREATE INDEX technical_events_recent_activity_idx ON technical_events(tenant_id,created_at DESC,id DESC) WHERE action IN ('REVIEW_SUBMIT','REVIEW_APPROVE','REVIEW_REJECT');
CREATE INDEX report_issues_recent_activity_idx ON report_issues(tenant_id,finished_at DESC,id DESC) WHERE state IN ('READY','FAILED') AND finished_at IS NOT NULL;
