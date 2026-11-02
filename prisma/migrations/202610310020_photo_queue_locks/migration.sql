CREATE OR REPLACE FUNCTION protect_file_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.borehole_id<>OLD.borehole_id OR NEW.work_id<>OLD.work_id OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Identity is immutable' USING ERRCODE='23514'; END IF;
 -- Queue-only updates do not edit the photo's parent or composition data. Avoid inverse parent/job lock order.
 IF TG_TABLE_NAME='borehole_photos' AND TG_OP='UPDATE' THEN
  IF NEW.caption=OLD.caption AND NEW.crop=OLD.crop AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.version=OLD.version THEN RETURN NEW;END IF;
 END IF;
 PERFORM id FROM works WHERE id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work unavailable' USING ERRCODE='23514';END IF;
 PERFORM id FROM boreholes WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Borehole unavailable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
