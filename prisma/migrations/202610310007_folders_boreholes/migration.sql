ALTER TABLE works ADD CONSTRAINT works_id_tenant_id_key UNIQUE(id, tenant_id);
CREATE TABLE folders (
 id UUID PRIMARY KEY, work_id UUID NOT NULL, tenant_id UUID NOT NULL,
 name VARCHAR(120) NOT NULL CHECK(length(trim(name))>0), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT folders_work_id_tenant_id_fkey FOREIGN KEY(work_id,tenant_id) REFERENCES works(id,tenant_id) ON DELETE RESTRICT,
 CONSTRAINT folders_id_work_id_tenant_id_key UNIQUE(id,work_id,tenant_id),
 CONSTRAINT folders_work_id_tenant_id_name_key UNIQUE(work_id,tenant_id,name)
);
CREATE TABLE boreholes (
 id UUID PRIMARY KEY, work_id UUID NOT NULL, tenant_id UUID NOT NULL, folder_id UUID,
 code VARCHAR(60) NOT NULL CHECK(length(trim(code))>0 AND code=upper(trim(code))),
 planned_depth_m DECIMAL(8,2) CHECK(planned_depth_m>0), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT boreholes_work_id_tenant_id_fkey FOREIGN KEY(work_id,tenant_id) REFERENCES works(id,tenant_id) ON DELETE RESTRICT,
 CONSTRAINT boreholes_folder_id_work_id_tenant_id_fkey FOREIGN KEY(folder_id,work_id,tenant_id) REFERENCES folders(id,work_id,tenant_id) ON DELETE RESTRICT,
 CONSTRAINT boreholes_work_id_tenant_id_code_key UNIQUE(work_id,tenant_id,code)
);
CREATE INDEX boreholes_folder_id_work_id_tenant_id_idx ON boreholes(folder_id,work_id,tenant_id);
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders FORCE ROW LEVEL SECURITY;
CREATE POLICY folders_select ON folders FOR SELECT USING (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=folders.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active));
CREATE POLICY folders_insert ON folders FOR INSERT WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=folders.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
CREATE POLICY folders_update ON folders FOR UPDATE USING (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=folders.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=folders.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
ALTER TABLE boreholes ENABLE ROW LEVEL SECURITY;
ALTER TABLE boreholes FORCE ROW LEVEL SECURITY;
CREATE POLICY boreholes_select ON boreholes FOR SELECT USING (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=boreholes.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active));
CREATE POLICY boreholes_insert ON boreholes FOR INSERT WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=boreholes.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
CREATE POLICY boreholes_update ON boreholes FOR UPDATE USING (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=boreholes.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=boreholes.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
