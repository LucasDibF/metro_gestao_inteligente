CREATE OR REPLACE FUNCTION protect_operational_records() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_admin BOOLEAN; parent_active BOOLEAN;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RETURN NEW; END IF;
 SELECT EXISTS (SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenant_id=NEW.tenant_id AND m.user_id::text=current_setting('app.user_id',true)
 AND m.active AND u.active AND m.role='ADMIN') INTO is_admin;
 IF TG_OP='INSERT' THEN
  IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN RAISE EXCEPTION 'Cannot create trashed records' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'Identity is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME<>'works' THEN
   IF NEW.work_id<>OLD.work_id THEN RAISE EXCEPTION 'Work is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Trashed records cannot be edited' USING ERRCODE='23514'; END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
   IF NOT is_admin THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='23514'; END IF;
   IF NEW.deleted_at IS NOT NULL THEN NEW.deleted_at:=CURRENT_TIMESTAMP; NEW.deleted_by:=current_setting('app.user_id')::uuid;
   ELSE NEW.deleted_by:=NULL; END IF;
  ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN RAISE EXCEPTION 'Deletion metadata is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME<>'works' THEN
  SELECT deleted_at IS NULL INTO parent_active FROM works WHERE id=NEW.work_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF parent_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Work unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='boreholes' THEN
 IF NEW.folder_id IS NOT NULL THEN
  SELECT deleted_at IS NULL INTO parent_active FROM folders WHERE id=NEW.folder_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF parent_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 IF NEW.deleted_at IS NOT NULL THEN
  IF TG_TABLE_NAME='works' THEN
   IF EXISTS(SELECT 1 FROM folders WHERE work_id=NEW.id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM boreholes WHERE work_id=NEW.id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'Active children exist' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='folders' THEN
   IF EXISTS(SELECT 1 FROM boreholes WHERE folder_id=NEW.id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'Active children exist' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
