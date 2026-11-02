ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'COMMERCIAL';
ALTER TABLE memberships ADD COLUMN additional_roles "MembershipRole"[] NOT NULL DEFAULT '{}', ADD COLUMN can_download_reports BOOLEAN NOT NULL DEFAULT true;
-- No existing membership receives an additional role automatically.
CREATE FUNCTION app_has_role(allowed TEXT[]) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id::text=current_setting('app.tenant_id',true) AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND (m.role::text=ANY(allowed) OR m.additional_roles::text[] && allowed))
$$;
CREATE FUNCTION app_field_write(hole UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT app_has_role(ARRAY['ENGINEER']) OR (app_has_role(ARRAY['OPERATOR']) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=hole AND b.tenant_id::text=current_setting('app.tenant_id',true) AND b.deleted_at IS NULL AND b.review_state='DRAFT'))
$$;
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='works' AND cmd IN ('INSERT','UPDATE') LOOP EXECUTE format('DROP POLICY %I ON works',p.policyname); END LOOP; END $$;
CREATE POLICY workflow_insert ON works FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL']));
CREATE POLICY workflow_update ON works FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN'])) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','OPERATOR']));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='folders' AND cmd IN ('INSERT','UPDATE') LOOP EXECUTE format('DROP POLICY %I ON folders',p.policyname); END LOOP; END $$;
CREATE POLICY workflow_insert ON folders FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER']));
CREATE POLICY workflow_update ON folders FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','ADMIN'])) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','OPERATOR']));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='boreholes' AND cmd IN ('INSERT','UPDATE') LOOP EXECUTE format('DROP POLICY %I ON boreholes',p.policyname); END LOOP; END $$;
CREATE POLICY workflow_insert ON boreholes FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER']));
CREATE POLICY workflow_update ON boreholes FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND (app_has_role(ARRAY['ENGINEER','ADMIN']) OR (app_has_role(ARRAY['OPERATOR']) AND review_state='DRAFT'))) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','OPERATOR']));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='spt_tests' AND cmd IN ('INSERT','UPDATE','ALL') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON spt_tests',p.policyname); END LOOP; END $$;
CREATE POLICY field_insert ON spt_tests FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
CREATE POLICY field_update ON spt_tests FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='soil_layers' AND cmd IN ('INSERT','UPDATE','ALL') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON soil_layers',p.policyname); END LOOP; END $$;
CREATE POLICY field_insert ON soil_layers FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
CREATE POLICY field_update ON soil_layers FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='borehole_coordinates' AND cmd IN ('INSERT','UPDATE','ALL') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON borehole_coordinates',p.policyname); END LOOP; END $$;
CREATE POLICY field_insert ON borehole_coordinates FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
CREATE POLICY field_update ON borehole_coordinates FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='borehole_photos' AND cmd IN ('INSERT','UPDATE','ALL') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON borehole_photos',p.policyname); END LOOP; END $$;
CREATE POLICY field_insert ON borehole_photos FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
CREATE POLICY field_update ON borehole_photos FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_field_write(borehole_id));
DROP POLICY events_insert ON technical_events;
CREATE POLICY events_insert ON technical_events FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND actor_id::text=current_setting('app.user_id',true) AND app_has_role(ARRAY['ENGINEER','OPERATOR']));
CREATE OR REPLACE FUNCTION protect_review_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.review_state='APPROVED' AND (OLD.review_state IS DISTINCT FROM NEW.review_state OR NEW.approved_version IS DISTINCT FROM OLD.approved_version) THEN
  IF OLD.review_state<>'IN_REVIEW' OR NEW.approved_version<>OLD.technical_version OR NEW.technical_version<>OLD.technical_version OR NEW.reviewed_by::text IS DISTINCT FROM current_setting('app.user_id',true) OR NOT app_has_role(ARRAY['ENGINEER']) THEN RAISE EXCEPTION 'Invalid technical approval' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION invalidate_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.executed_depth_m IS DISTINCT FROM OLD.executed_depth_m OR NEW.water_level_m IS DISTINCT FROM OLD.water_level_m OR NEW.field_date IS DISTINCT FROM OLD.field_date OR NEW.official_coordinate_id IS DISTINCT FROM OLD.official_coordinate_id THEN
 NEW.technical_version=OLD.technical_version+1;NEW.review_state=CASE WHEN OLD.review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END;NEW.approved_version=NULL;NEW.reviewed_by=NULL;NEW.reviewed_at=NULL;NEW.reviewer_name=NULL;NEW.reviewer_registration=NULL;NEW.review_note=NULL;
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION bump_technical_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor UUID;
BEGIN
 actor=NULLIF(current_setting('app.user_id',true),'')::uuid;
 UPDATE boreholes SET technical_version=technical_version+1,review_state=CASE WHEN review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END,approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,review_note=NULL WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id;
 IF actor IS NOT NULL THEN
 INSERT INTO technical_events(id,tenant_id,work_id,borehole_id,actor_id,action,technical_version,details)
 SELECT gen_random_uuid(),NEW.tenant_id,NEW.work_id,NEW.borehole_id,actor,TG_TABLE_NAME||'_'||TG_OP,b.technical_version,jsonb_build_object('recordId',NEW.id) FROM boreholes b WHERE b.id=NEW.borehole_id;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION protect_field_actor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['OPERATOR']) AND NOT app_has_role(ARRAY['ENGINEER']) THEN
  IF OLD.review_state<>'DRAFT' OR NEW.review_state NOT IN ('DRAFT','IN_REVIEW') OR (to_jsonb(NEW)-ARRAY['executed_depth_m','water_level_m','field_date','official_coordinate_id','technical_version','review_state','review_note','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['executed_depth_m','water_level_m','field_date','official_coordinate_id','technical_version','review_state','review_note','version','updated_at']) THEN RAISE EXCEPTION 'Field execution is locked or identification changed' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_field_actor BEFORE UPDATE ON boreholes FOR EACH ROW EXECUTE FUNCTION protect_field_actor();
