ALTER TABLE memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE membership_events(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,actor_id UUID NOT NULL,user_id UUID NOT NULL,action TEXT NOT NULL,details JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE membership_events ENABLE ROW LEVEL SECURITY; ALTER TABLE membership_events FORCE ROW LEVEL SECURITY;
CREATE FUNCTION admin_members_list() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT public.app_has_role(ARRAY['ADMIN']) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'role',m.role,'additionalRoles',m.additional_roles,'active',m.active AND u.active,'canDownloadReports',m.can_download_reports,'version',m.version) ORDER BY u.email),'[]') FROM public.memberships m JOIN public.users u ON u.id=m.user_id WHERE m.tenant_id::text=current_setting('app.tenant_id',true));
END $$;
CREATE FUNCTION admin_member_create(mail TEXT,hash TEXT,roles "MembershipRole"[],download BOOLEAN) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE uid UUID=gen_random_uuid(); tid UUID=NULLIF(current_setting('app.tenant_id',true),'')::uuid; BEGIN
 IF NOT public.app_has_role(ARRAY['ADMIN']) OR cardinality(roles)<1 OR cardinality(roles)>5 THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,42));
 INSERT INTO public.users(id,email,password_hash) VALUES(uid,mail,hash);
 INSERT INTO public.memberships(tenant_id,user_id,role,additional_roles,can_download_reports) VALUES(tid,uid,roles[1],roles[2:cardinality(roles)],download);
 INSERT INTO public.membership_events(tenant_id,actor_id,user_id,action,details) VALUES(tid,current_setting('app.user_id')::uuid,uid,'ACCESS_CREATED',jsonb_build_object('roles',roles,'canDownloadReports',download));
 RETURN uid;
END $$;
CREATE FUNCTION admin_member_update(uid UUID,roles "MembershipRole"[],enabled BOOLEAN,download BOOLEAN,expected INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE tid UUID=NULLIF(current_setting('app.tenant_id',true),'')::uuid; current_row public.memberships; admins INTEGER; BEGIN
 IF NOT public.app_has_role(ARRAY['ADMIN']) OR cardinality(roles)<1 OR cardinality(roles)>5 THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text,42));
 SELECT * INTO current_row FROM public.memberships WHERE tenant_id=tid AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='P0002'; END IF;
 IF current_row.version<>expected THEN RETURN false; END IF;
 IF uid::text=current_setting('app.user_id',true) AND (NOT enabled OR NOT ('ADMIN'::public."MembershipRole"=ANY(roles))) THEN RAISE EXCEPTION 'Cannot remove own administration access' USING ERRCODE='23514'; END IF;
 IF (current_row.role='ADMIN' OR 'ADMIN'=ANY(current_row.additional_roles)) AND (NOT enabled OR NOT ('ADMIN'::public."MembershipRole"=ANY(roles))) THEN
 SELECT count(*) INTO admins FROM public.memberships m JOIN public.users u ON u.id=m.user_id WHERE m.tenant_id=tid AND m.active AND u.active AND (m.role='ADMIN' OR 'ADMIN'=ANY(m.additional_roles));
 IF admins<=1 THEN RAISE EXCEPTION 'Last administrator must remain active' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE public.memberships SET role=roles[1],additional_roles=roles[2:cardinality(roles)],active=enabled,can_download_reports=download,version=version+1 WHERE tenant_id=tid AND user_id=uid;
 IF NOT enabled THEN UPDATE public.auth_sessions SET revoked_at=now() WHERE tenant_id=tid AND user_id=uid AND revoked_at IS NULL; END IF;
 INSERT INTO public.membership_events(tenant_id,actor_id,user_id,action,details) VALUES(tid,current_setting('app.user_id')::uuid,uid,'ACCESS_UPDATED',jsonb_build_object('previousRoles',array_prepend(current_row.role,current_row.additional_roles),'roles',roles,'active',enabled,'canDownloadReports',download));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION admin_members_list(),admin_member_create(TEXT,TEXT,"MembershipRole"[],BOOLEAN),admin_member_update(UUID,"MembershipRole"[],BOOLEAN,BOOLEAN,INTEGER) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN GRANT EXECUTE ON FUNCTION admin_members_list(),admin_member_create(TEXT,TEXT,"MembershipRole"[],BOOLEAN),admin_member_update(UUID,"MembershipRole"[],BOOLEAN,BOOLEAN,INTEGER) TO spt_runtime; END IF; END $$;
CREATE TABLE clients(id UUID PRIMARY KEY,tenant_id UUID NOT NULL REFERENCES tenants(id),name VARCHAR(200) NOT NULL CHECK(length(trim(name))>0),document VARCHAR(40),email VARCHAR(254),phone VARCHAR(40),address VARCHAR(500),version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),UNIQUE(id,tenant_id));
CREATE INDEX clients_tenant_id_name_id_idx ON clients(tenant_id,name,id);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY; ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_read ON clients FOR SELECT USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER','COMMERCIAL','ADMIN','VIEWER']));
CREATE POLICY clients_insert ON clients FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['COMMERCIAL','ENGINEER']));
CREATE POLICY clients_update ON clients FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['COMMERCIAL','ENGINEER'])) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['COMMERCIAL','ENGINEER']));
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN GRANT SELECT,INSERT,UPDATE ON clients TO spt_runtime; END IF; END $$;
CREATE FUNCTION protect_administration_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF app_has_role(ARRAY['ADMIN']) AND NOT app_has_role(ARRAY['ENGINEER','COMMERCIAL']) AND (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN RAISE EXCEPTION 'Technical or commercial role required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_administration BEFORE UPDATE ON boreholes FOR EACH ROW EXECUTE FUNCTION protect_administration_only();
CREATE TRIGGER workflow_administration BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION protect_administration_only();
CREATE TRIGGER workflow_administration BEFORE UPDATE ON works FOR EACH ROW EXECUTE FUNCTION protect_administration_only();
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND cmd IN ('INSERT','UPDATE') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON reports',p.policyname); END LOOP; END $$;
CREATE POLICY engineering_insert ON reports FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER']));
CREATE POLICY engineering_update ON reports FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER'])) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER']));
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='report_issues' AND cmd IN ('INSERT','UPDATE') AND policyname NOT LIKE '%worker%' LOOP EXECUTE format('DROP POLICY %I ON report_issues',p.policyname); END LOOP; END $$;
CREATE POLICY engineering_insert ON report_issues FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true) AND app_has_role(ARRAY['ENGINEER']));
