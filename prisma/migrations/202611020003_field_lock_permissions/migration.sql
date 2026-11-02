-- Field writes lock their work before locking the borehole. Operators may acquire that
-- lock, but cannot mutate the work's commercial metadata.
DROP POLICY workflow_update ON works;
CREATE POLICY workflow_update ON works FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','OPERATOR'])) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','OPERATOR']));
CREATE FUNCTION protect_operator_work() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['OPERATOR']) AND NOT app_has_role(ARRAY['ENGINEER','COMMERCIAL']) AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Operator cannot edit work identification' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_operator_work BEFORE UPDATE ON works FOR EACH ROW EXECUTE FUNCTION protect_operator_work();
