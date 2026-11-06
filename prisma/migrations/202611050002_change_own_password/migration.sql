-- The runtime role only has SELECT on users; a user changes their own password through this function.
CREATE FUNCTION change_own_password(expected TEXT,hash TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE uid UUID=NULLIF(current_setting('app.user_id',true),'')::uuid; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'User context required' USING ERRCODE='42501'; END IF;
 UPDATE public.users SET password_hash=hash WHERE id=uid AND active AND password_hash=expected;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION change_own_password(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_own_password(TEXT,TEXT) TO spt_runtime;
