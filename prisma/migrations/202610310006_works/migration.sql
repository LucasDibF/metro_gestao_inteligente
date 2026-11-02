CREATE TABLE works (
 id UUID PRIMARY KEY,
 tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 name VARCHAR(200) NOT NULL CHECK (length(trim(name)) > 0),
 client_name VARCHAR(200), city VARCHAR(120), state CHAR(2), address VARCHAR(500),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX works_tenant_id_created_at_id_idx ON works(tenant_id, created_at, id);
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE works FORCE ROW LEVEL SECURITY;
CREATE POLICY works_read ON works FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true)
 AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
 WHERE m.tenant_id = works.tenant_id AND m.user_id::text = current_setting('app.user_id', true)
 AND m.active AND u.active ));
CREATE POLICY works_insert ON works FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true)
 AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
 WHERE m.tenant_id = works.tenant_id AND m.user_id::text = current_setting('app.user_id', true)
 AND m.active AND u.active AND m.role IN ('ADMIN', 'ENGINEER')));
CREATE POLICY works_update ON works FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true)
 AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
 WHERE m.tenant_id = works.tenant_id AND m.user_id::text = current_setting('app.user_id', true)
 AND m.active AND u.active AND m.role IN ('ADMIN', 'ENGINEER'))) WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true)
 AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
 WHERE m.tenant_id = works.tenant_id AND m.user_id::text = current_setting('app.user_id', true)
 AND m.active AND u.active AND m.role IN ('ADMIN', 'ENGINEER')));
-- Deletion is not granted or exposed in this delivery.
