ALTER TABLE boreholes ADD COLUMN executed_depth_m DECIMAL(8,2) CHECK(executed_depth_m>0),
 ADD COLUMN water_level_m DECIMAL(8,2) CHECK(water_level_m>=0), ADD COLUMN field_date DATE,
 ADD COLUMN technical_version INTEGER NOT NULL DEFAULT 1 CHECK(technical_version>0),
 ADD COLUMN review_state VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(review_state IN ('DRAFT','IN_REVIEW','APPROVED')),
 ADD COLUMN approved_version INTEGER, ADD COLUMN reviewed_by UUID, ADD COLUMN reviewed_at TIMESTAMPTZ(3),
 ADD COLUMN reviewer_name VARCHAR(200), ADD COLUMN reviewer_registration VARCHAR(100), ADD COLUMN review_note VARCHAR(2000),
 ADD CONSTRAINT approved_version_matches CHECK(review_state<>'APPROVED' OR (approved_version=technical_version AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewer_name IS NOT NULL AND reviewer_registration IS NOT NULL));
CREATE TABLE soil_layers (
 id UUID PRIMARY KEY, borehole_id UUID NOT NULL, work_id UUID NOT NULL, tenant_id UUID NOT NULL,
 from_m DECIMAL(8,2) NOT NULL CHECK(from_m>=0), to_m DECIMAL(8,2) NOT NULL CHECK(to_m>from_m),
 soil_type VARCHAR(120) NOT NULL CHECK(length(trim(soil_type))>0), description VARCHAR(2000) NOT NULL CHECK(length(trim(description))>0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id) ON DELETE RESTRICT,
 UNIQUE(borehole_id,work_id,tenant_id,from_m)
);
CREATE TABLE technical_events (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL, work_id UUID NOT NULL, borehole_id UUID NOT NULL,
 actor_id UUID NOT NULL, action VARCHAR(60) NOT NULL, technical_version INTEGER NOT NULL,
 details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id) ON DELETE RESTRICT
);
CREATE INDEX technical_events_scope_idx ON technical_events(tenant_id,borehole_id,created_at);
ALTER TABLE soil_layers ENABLE ROW LEVEL SECURITY; ALTER TABLE soil_layers FORCE ROW LEVEL SECURITY;
ALTER TABLE technical_events ENABLE ROW LEVEL SECURITY; ALTER TABLE technical_events FORCE ROW LEVEL SECURITY;
CREATE POLICY soil_read ON soil_layers FOR SELECT USING(EXISTS(SELECT 1 FROM boreholes b WHERE b.id=soil_layers.borehole_id AND b.work_id=soil_layers.work_id AND b.tenant_id=soil_layers.tenant_id AND b.deleted_at IS NULL) AND tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY soil_write ON soil_layers FOR ALL USING(tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=soil_layers.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=soil_layers.borehole_id AND b.work_id=soil_layers.work_id AND b.tenant_id=soil_layers.tenant_id AND b.deleted_at IS NULL) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=soil_layers.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
CREATE POLICY events_read ON technical_events FOR SELECT USING(tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=technical_events.borehole_id AND b.work_id=technical_events.work_id AND b.tenant_id=technical_events.tenant_id));
CREATE POLICY events_insert ON technical_events FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND actor_id::text=current_setting('app.user_id',true) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=technical_events.tenant_id AND m.user_id=technical_events.actor_id AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER')));
CREATE FUNCTION invalidate_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.executed_depth_m IS DISTINCT FROM OLD.executed_depth_m OR NEW.water_level_m IS DISTINCT FROM OLD.water_level_m OR NEW.field_date IS DISTINCT FROM OLD.field_date THEN
  NEW.technical_version=OLD.technical_version+1; NEW.review_state='DRAFT'; NEW.approved_version=NULL;
  NEW.reviewed_by=NULL; NEW.reviewed_at=NULL; NEW.reviewer_name=NULL; NEW.reviewer_registration=NULL; NEW.review_note=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_technical_review BEFORE UPDATE ON boreholes FOR EACH ROW EXECUTE FUNCTION invalidate_technical_review();
CREATE FUNCTION bump_technical_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor UUID;
BEGIN
 actor=NULLIF(current_setting('app.user_id',true),'')::uuid;
 UPDATE boreholes SET technical_version=technical_version+1,review_state='DRAFT',approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,review_note=NULL WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id;
 IF actor IS NOT NULL THEN
 INSERT INTO technical_events(id,tenant_id,work_id,borehole_id,actor_id,action,technical_version,details)
 SELECT gen_random_uuid(),NEW.tenant_id,NEW.work_id,NEW.borehole_id,actor,TG_TABLE_NAME||'_'||TG_OP,b.technical_version,jsonb_build_object('recordId',NEW.id) FROM boreholes b WHERE b.id=NEW.borehole_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER spt_technical_change AFTER INSERT OR UPDATE ON spt_tests FOR EACH ROW EXECUTE FUNCTION bump_technical_parent();
CREATE TRIGGER soil_technical_change AFTER INSERT OR UPDATE ON soil_layers FOR EACH ROW EXECUTE FUNCTION bump_technical_parent();

CREATE FUNCTION protect_technical_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Technical history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER technical_event_immutable BEFORE UPDATE ON technical_events FOR EACH ROW EXECUTE FUNCTION protect_technical_event();
