-- Field writes need a row lock on the parent folder, not permission to edit it.
DROP POLICY workflow_update ON folders;
CREATE POLICY workflow_update ON folders FOR UPDATE
USING (tenant_id::text = current_setting('app.tenant_id', true)
  AND app_has_role(ARRAY['ENGINEER', 'ADMIN', 'OPERATOR']))
WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true)
  AND app_has_role(ARRAY['ENGINEER', 'ADMIN', 'OPERATOR']));

CREATE FUNCTION protect_operator_folder() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_has_role(ARRAY['OPERATOR']) AND NOT app_has_role(ARRAY['ENGINEER', 'ADMIN'])
     AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'Operator cannot edit folders' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_operator_folder BEFORE UPDATE ON folders
FOR EACH ROW EXECUTE FUNCTION protect_operator_folder();
