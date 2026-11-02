ALTER TABLE boreholes ADD CONSTRAINT boreholes_id_work_id_tenant_id_key UNIQUE(id,work_id,tenant_id);
CREATE TABLE spt_tests (
 id UUID PRIMARY KEY,borehole_id UUID NOT NULL,work_id UUID NOT NULL,tenant_id UUID NOT NULL,
 depth_m DECIMAL(8,2) NOT NULL CHECK(depth_m>=0),advances JSONB NOT NULL CHECK(jsonb_typeof(advances)='array' AND jsonb_array_length(advances)<=3),
 interruption_reason VARCHAR(500),result JSONB NOT NULL,engine_version VARCHAR(40) NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_by UUID NOT NULL,updated_by UUID NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT spt_tests_borehole_id_work_id_tenant_id_fkey FOREIGN KEY(borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id) ON DELETE RESTRICT,
 CONSTRAINT spt_tests_borehole_id_work_id_tenant_id_depth_m_key UNIQUE(borehole_id,work_id,tenant_id,depth_m)
);
ALTER TABLE spt_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE spt_tests FORCE ROW LEVEL SECURITY;
CREATE POLICY spt_tests_select ON spt_tests FOR SELECT USING(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active )
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL));
CREATE POLICY spt_tests_insert ON spt_tests FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER','OPERATOR'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL));
CREATE POLICY spt_tests_update ON spt_tests FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER','OPERATOR'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER','OPERATOR'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL));
CREATE FUNCTION protect_spt_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.borehole_id<>OLD.borehole_id OR NEW.work_id<>OLD.work_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.created_by<>OLD.created_by THEN RAISE EXCEPTION 'SPT identity is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM works WHERE id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work unavailable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM boreholes WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Borehole unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_spt_parent BEFORE INSERT OR UPDATE ON spt_tests FOR EACH ROW EXECUTE FUNCTION protect_spt_parent();
