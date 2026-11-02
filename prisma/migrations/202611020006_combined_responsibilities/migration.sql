-- Preserve additive, explicitly assigned responsibilities without granting new roles.
CREATE OR REPLACE FUNCTION protect_field_actor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['ADMIN']) AND (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN RETURN NEW; END IF;
 IF app_has_role(ARRAY['OPERATOR']) AND NOT app_has_role(ARRAY['ENGINEER']) THEN
  IF OLD.review_state<>'DRAFT' OR NEW.review_state NOT IN ('DRAFT','IN_REVIEW') OR (to_jsonb(NEW)-ARRAY['executed_depth_m','water_level_m','field_date','official_coordinate_id','technical_version','review_state','review_note','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['executed_depth_m','water_level_m','field_date','official_coordinate_id','technical_version','review_state','review_note','version','updated_at']) THEN RAISE EXCEPTION 'Field execution is locked or identification changed' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_administration_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='boreholes' AND app_has_role(ARRAY['OPERATOR']) THEN RETURN NEW; END IF;
 IF app_has_role(ARRAY['ADMIN']) AND NOT app_has_role(CASE WHEN TG_TABLE_NAME='works' THEN ARRAY['ENGINEER','COMMERCIAL'] ELSE ARRAY['ENGINEER'] END) AND (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN RAISE EXCEPTION 'Technical or commercial role required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_operator_work() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['OPERATOR']) AND NOT app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN']) AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Operator cannot edit work identification' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
