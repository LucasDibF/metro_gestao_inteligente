CREATE TABLE work_assignments (
 work_id UUID PRIMARY KEY,
 tenant_id UUID NOT NULL,
 operator_id UUID NOT NULL,
 assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 active BOOLEAN NOT NULL DEFAULT true,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(work_id,tenant_id),
 FOREIGN KEY(work_id,tenant_id) REFERENCES works(id,tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,operator_id) REFERENCES memberships(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX work_assignments_operator_idx ON work_assignments(tenant_id,operator_id,active);
ALTER TABLE work_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_assignments FORCE ROW LEVEL SECURITY;
CREATE FUNCTION field_assignment_manager() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenant_id::text=current_setting('app.tenant_id',true)
 AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active
 AND (ARRAY[m.role::text] || m.additional_roles::text[]) && ARRAY['ADMIN','COMMERCIAL']::text[])
$$;
CREATE POLICY work_assignment_read ON work_assignments FOR SELECT USING (
 tenant_id::text=current_setting('app.tenant_id',true)
 AND (operator_id::text=current_setting('app.user_id',true) OR field_assignment_manager())
);
CREATE POLICY work_assignment_insert ON work_assignments FOR INSERT WITH CHECK (
 tenant_id::text=current_setting('app.tenant_id',true) AND field_assignment_manager()
 AND assigned_by::text=current_setting('app.user_id',true)
);
CREATE POLICY work_assignment_update ON work_assignments FOR UPDATE USING (
 tenant_id::text=current_setting('app.tenant_id',true) AND field_assignment_manager()
) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true) AND field_assignment_manager()
 AND assigned_by::text=current_setting('app.user_id',true));
CREATE FUNCTION validate_work_assignment() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.active AND NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenant_id=NEW.tenant_id AND m.user_id=NEW.operator_id AND m.active AND u.active
 AND 'OPERATOR'::text=ANY(ARRAY[m.role::text] || m.additional_roles::text[])) THEN
  RAISE EXCEPTION 'Active operator required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_assignment_valid BEFORE INSERT OR UPDATE ON work_assignments FOR EACH ROW EXECUTE FUNCTION validate_work_assignment();
CREATE FUNCTION field_operators() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT field_assignment_manager() THEN RAISE EXCEPTION 'Assignment management unavailable' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email) ORDER BY u.email)
 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id::text=current_setting('app.tenant_id',true)
 AND m.active AND u.active AND 'OPERATOR'::text=ANY(ARRAY[m.role::text] || m.additional_roles::text[])),'[]'::jsonb);
END $$;
CREATE FUNCTION can_read_assigned_work(work UUID,tenant UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenant_id=tenant AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active
 AND (NOT ((ARRAY[m.role::text] || m.additional_roles::text[]) <@ ARRAY['OPERATOR']::text[])
 OR EXISTS(SELECT 1 FROM work_assignments a WHERE a.work_id=work AND a.tenant_id=tenant
 AND a.operator_id=m.user_id AND a.active)))
$$;
CREATE POLICY works_field_assignment ON works AS RESTRICTIVE FOR SELECT USING (can_read_assigned_work(id,tenant_id));
REVOKE ALL ON FUNCTION field_operators() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_work_assignment() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN
 GRANT SELECT,INSERT,UPDATE ON work_assignments TO spt_runtime;
 GRANT EXECUTE ON FUNCTION field_operators() TO spt_runtime;
END IF; END $$;
