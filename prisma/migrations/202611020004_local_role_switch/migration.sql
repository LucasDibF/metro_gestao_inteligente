CREATE OR REPLACE FUNCTION set_local_test_role(test_user UUID,test_tenant UUID,test_role TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
      IF test_user::text IS DISTINCT FROM current_setting('app.user_id',true) OR test_tenant::text IS DISTINCT FROM current_setting('app.tenant_id',true) OR test_role NOT IN ('ADMIN','ENGINEER','OPERATOR','COMMERCIAL','VIEWER') OR NOT EXISTS(SELECT 1 FROM public.users u JOIN public.memberships m ON m.user_id=u.id WHERE u.id=test_user AND u.email='dev-bypass@example.invalid' AND u.active AND m.tenant_id=test_tenant AND m.active) THEN RAISE EXCEPTION 'Development role unavailable'; END IF;
      UPDATE public.memberships SET additional_roles='{}',role=test_role::public."MembershipRole" WHERE user_id=test_user AND tenant_id=test_tenant;
    END $$;
REVOKE ALL ON FUNCTION set_local_test_role(UUID,UUID,TEXT) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN GRANT EXECUTE ON FUNCTION set_local_test_role(UUID,UUID,TEXT) TO spt_runtime; END IF; END $$;
