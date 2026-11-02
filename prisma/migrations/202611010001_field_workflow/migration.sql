-- Additive fields preserve every existing record and report issue.
ALTER TABLE spt_tests ADD COLUMN field_details jsonb;
ALTER TABLE soil_layers ADD COLUMN soil_color varchar(120), ADD COLUMN soil_moisture varchar(20);
ALTER TABLE borehole_photos ADD COLUMN purpose varchar(20) CHECK (purpose IN ('SITE','EXECUTION','SAMPLE_1','SAMPLE_2','OTHER'));
CREATE TABLE notification_reads (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key varchar(60) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,event_key)
);
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY own_activity ON notification_reads FOR ALL
 USING (tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=notification_reads.tenant_id AND m.user_id=notification_reads.user_id AND m.active AND u.active))
 WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=notification_reads.tenant_id AND m.user_id=notification_reads.user_id AND m.active AND u.active));
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN
 GRANT SELECT,INSERT ON notification_reads TO spt_runtime;
 GRANT UPDATE(purpose) ON borehole_photos TO spt_runtime;
END IF; END $$;
