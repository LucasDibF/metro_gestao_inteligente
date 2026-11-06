BEGIN;
DO $$ BEGIN IF current_database()<>'spt_test' THEN RAISE EXCEPTION 'Use spt_test only'; END IF; END $$;
DO $$
DECLARE t uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); eng uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 w uuid:=gen_random_uuid(); hole uuid:=gen_random_uuid(); n integer; title text;
BEGIN
 INSERT INTO tenants(id,name)VALUES(t,'Profile test'),(other,'Other profile test');
 INSERT INTO users(id,email,password_hash)VALUES(eng,eng::text||'@example.invalid','unused'),(peer,peer::text||'@example.invalid','unused'),(op,op::text||'@example.invalid','unused');
 INSERT INTO memberships(tenant_id,user_id,role)VALUES(t,eng,'ENGINEER'),(t,peer,'ENGINEER'),(t,op,'OPERATOR'),(other,eng,'ENGINEER');
 INSERT INTO professional_profiles(tenant_id,user_id,full_name)VALUES(other,eng,'Other tenant profile'),(t,peer,'Peer profile');
 SET LOCAL ROLE spt_runtime;
 PERFORM set_config('app.user_id',eng::text,true),set_config('app.tenant_id',t::text,true);
 INSERT INTO professional_profiles(tenant_id,user_id,full_name,crea_number,crea_uf,professional_title)VALUES(t,eng,'Engenheira Teste','5060000000','SP','Engenheira civil');
 SELECT count(*) INTO n FROM professional_profiles;
 IF n<>1 THEN RAISE EXCEPTION 'Engineer must see only own profile in tenant: %',n; END IF;
 UPDATE professional_profiles SET full_name='Changed' WHERE user_id=peer;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Engineer changed a peer profile'; END IF;
 BEGIN
  INSERT INTO professional_profiles(tenant_id,user_id)VALUES(t,op);
  RAISE EXCEPTION 'Profile for another user was created';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE professional_profiles SET crea_uf='sp' WHERE user_id=eng;
  RAISE EXCEPTION 'Lowercase UF accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM professional_profiles WHERE user_id=eng;
  RAISE EXCEPTION 'Runtime deleted a profile';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('app.user_id',op::text,true);
 BEGIN
  INSERT INTO professional_profiles(tenant_id,user_id)VALUES(t,op);
  RAISE EXCEPTION 'Operator created a profile';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT count(*) INTO n FROM professional_profiles;
 IF n<>0 THEN RAISE EXCEPTION 'Operator saw profiles: %',n; END IF;
 PERFORM set_config('app.user_id',eng::text,true),set_config('app.tenant_id',other::text,true);
 SELECT count(*) INTO n FROM professional_profiles WHERE tenant_id=t;
 IF n<>0 THEN RAISE EXCEPTION 'Profile leaked across tenants'; END IF;
 RESET ROLE;
 PERFORM set_config('app.tenant_id',t::text,true);
 INSERT INTO works(id,tenant_id,name)VALUES(w,t,'Title work');
 INSERT INTO boreholes(id,work_id,tenant_id,code,review_state,technical_version,approved_version,reviewed_by,reviewed_at,reviewer_name,reviewer_registration,reviewer_title)
  VALUES(hole,w,t,'SP-01','APPROVED',1,1,eng,now(),'Engenheira Teste','CREA-SP 5060000000','Engenheira civil');
 UPDATE boreholes SET executed_depth_m=10 WHERE id=hole;
 SELECT reviewer_title INTO title FROM boreholes WHERE id=hole;
 IF title IS NOT NULL THEN RAISE EXCEPTION 'Reviewer title survived technical change'; END IF;
 BEGIN
  UPDATE boreholes SET reviewer_title='  ' WHERE id=hole;
  RAISE EXCEPTION 'Blank reviewer title accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
