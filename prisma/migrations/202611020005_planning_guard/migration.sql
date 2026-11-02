CREATE FUNCTION protect_field_planning() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.kind='PLANNED' AND NOT app_has_role(ARRAY['ENGINEER']) THEN RAISE EXCEPTION 'Planning requires engineering role' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_planning BEFORE INSERT OR UPDATE ON borehole_coordinates FOR EACH ROW EXECUTE FUNCTION protect_field_planning();
CREATE OR REPLACE FUNCTION protect_administration_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['ADMIN']) AND NOT app_has_role(CASE WHEN TG_TABLE_NAME='works' THEN ARRAY['ENGINEER','COMMERCIAL'] ELSE ARRAY['ENGINEER'] END) AND (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN RAISE EXCEPTION 'Technical or commercial role required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
