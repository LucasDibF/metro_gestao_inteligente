CREATE TABLE reports (
 id UUID PRIMARY KEY,tenant_id UUID NOT NULL,work_id UUID NOT NULL,title VARCHAR(200) NOT NULL,notes VARCHAR(4000) NOT NULL DEFAULT '',
 composition JSONB NOT NULL,version INTEGER NOT NULL DEFAULT 1,issue_counter INTEGER NOT NULL DEFAULT 0,current_issue_id UUID,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(work_id,tenant_id) REFERENCES works(id,tenant_id) ON DELETE RESTRICT,UNIQUE(id,work_id,tenant_id)
);
CREATE TABLE report_issues (
 id UUID PRIMARY KEY,report_id UUID NOT NULL,work_id UUID NOT NULL,tenant_id UUID NOT NULL,requested_by UUID NOT NULL,
 idempotency_key UUID NOT NULL,request_hash CHAR(64) NOT NULL,composition_version INTEGER NOT NULL,issue_number INTEGER NOT NULL,
 snapshot JSONB NOT NULL,snapshot_hash CHAR(64) NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','READY','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,lease_token UUID,lease_until TIMESTAMPTZ(3),
 object_key TEXT,pdf_sha256 CHAR(64),error_code VARCHAR(60),created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TIMESTAMPTZ(3),
 FOREIGN KEY(report_id,work_id,tenant_id) REFERENCES reports(id,work_id,tenant_id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,report_id,requested_by,idempotency_key),UNIQUE(report_id,issue_number),UNIQUE(id,report_id,work_id,tenant_id)
);
ALTER TABLE reports ADD FOREIGN KEY(current_issue_id,id,work_id,tenant_id) REFERENCES report_issues(id,report_id,work_id,tenant_id) ON DELETE RESTRICT;
CREATE INDEX report_queue_claim_idx ON report_issues(state,available_at,lease_until);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;ALTER TABLE reports FORCE ROW LEVEL SECURITY;
ALTER TABLE report_issues ENABLE ROW LEVEL SECURITY;ALTER TABLE report_issues FORCE ROW LEVEL SECURITY;
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['reports','report_issues'] LOOP
 EXECUTE format('CREATE POLICY scoped_read ON %I FOR SELECT USING(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM works w WHERE w.id=%I.work_id AND w.tenant_id=%I.tenant_id AND w.deleted_at IS NULL))',t,t,t);
 EXECUTE format('CREATE POLICY scoped_insert ON %I FOR INSERT WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM works w WHERE w.id=%I.work_id AND w.tenant_id=%I.tenant_id AND w.deleted_at IS NULL) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=%I.tenant_id AND m.user_id::text=current_setting(''app.user_id'',true) AND m.active AND u.active AND m.role IN (''ADMIN'',''ENGINEER'')))',t,t,t,t);
 END LOOP; END $$;
CREATE POLICY report_update ON reports FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=reports.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
CREATE FUNCTION immutable_issue_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.report_id<>OLD.report_id OR NEW.work_id<>OLD.work_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.requested_by<>OLD.requested_by OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.request_hash<>OLD.request_hash OR NEW.composition_version<>OLD.composition_version OR NEW.issue_number<>OLD.issue_number OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.snapshot_hash<>OLD.snapshot_hash OR NEW.created_at<>OLD.created_at OR OLD.state='READY' THEN RAISE EXCEPTION 'Issued history is immutable' USING ERRCODE='23514'; END IF; RETURN NEW;END $$;
CREATE TRIGGER immutable_issue_snapshot BEFORE UPDATE ON report_issues FOR EACH ROW EXECUTE FUNCTION immutable_issue_snapshot();
CREATE FUNCTION claim_report_job() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.report_issues;BEGIN
 UPDATE public.report_issues SET state='FAILED',error_code='RETRIES_EXHAUSTED',finished_at=now(),lease_token=NULL,lease_until=NULL WHERE attempts>=3 AND (state='PENDING' OR (state='PROCESSING' AND lease_until<now()));
 SELECT * INTO job FROM public.report_issues WHERE attempts<3 AND ((state='PENDING' AND available_at<=now()) OR (state='PROCESSING' AND lease_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.report_issues SET state='PROCESSING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',error_code=NULL WHERE id=job.id RETURNING * INTO job;
 RETURN jsonb_build_object('id',job.id,'tenantId',job.tenant_id,'workId',job.work_id,'reportId',job.report_id,'leaseToken',job.lease_token,'snapshot',job.snapshot,'snapshotHash',job.snapshot_hash,'attempts',job.attempts);
END $$;
CREATE FUNCTION fail_report_job(job_id UUID,token UUID,permanent BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.report_issues SET state=CASE WHEN permanent OR attempts>=3 THEN 'FAILED' ELSE 'PENDING' END,available_at=now()+make_interval(secs=>power(2,attempts)::integer*5),error_code=CASE WHEN permanent THEN 'INVALID_SNAPSHOT' ELSE 'GENERATION_FAILED' END,lease_token=NULL,lease_until=NULL WHERE id=job_id AND state='PROCESSING' AND lease_token=token AND lease_until>now();RETURN FOUND;END $$;
CREATE FUNCTION publish_report_job(job_id UUID,token UUID,object_key_value TEXT,sha_value TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.report_issues; r public.reports;BEGIN
 SELECT * INTO job FROM public.report_issues WHERE id=job_id;
 IF NOT FOUND THEN RETURN FALSE;END IF;
 PERFORM id FROM public.works WHERE id=job.work_id FOR UPDATE;
 SELECT * INTO r FROM public.reports WHERE id=job.report_id FOR UPDATE;
 SELECT * INTO job FROM public.report_issues WHERE id=job_id FOR UPDATE;
 IF job.state<>'PROCESSING' OR job.lease_token<>token OR job.lease_until<=now() OR sha_value!~'^[0-9a-f]{64}$' OR object_key_value<>job.tenant_id::text||'/'||job.work_id::text||'/reports/'||job.id::text||'/'||sha_value||'.pdf' THEN RETURN FALSE;END IF;
 UPDATE public.report_issues SET state='READY',object_key=object_key_value,pdf_sha256=sha_value,finished_at=now(),lease_token=NULL,lease_until=NULL WHERE id=job.id;
 IF r.version=job.composition_version AND r.issue_counter=job.issue_number
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.snapshot->'holes') h LEFT JOIN public.boreholes b ON b.id=(h->>'id')::uuid AND b.work_id=job.work_id AND b.tenant_id=job.tenant_id WHERE b.id IS NULL OR b.deleted_at IS NOT NULL OR b.review_state<>'APPROVED' OR b.technical_version<>(h->>'technicalVersion')::integer OR b.approved_version<>b.technical_version)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.snapshot->'photos') p LEFT JOIN public.borehole_photos f ON f.id=(p->>'id')::uuid AND f.tenant_id=job.tenant_id AND f.work_id=job.work_id WHERE f.id IS NULL OR f.deleted_at IS NOT NULL OR f.version<>(p->>'version')::integer)
 AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=job.work_id AND w.deleted_at IS NULL) THEN UPDATE public.reports SET current_issue_id=job.id WHERE id=r.id;END IF;
 RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION claim_report_job(),fail_report_job(UUID,UUID,BOOLEAN),publish_report_job(UUID,UUID,TEXT,TEXT) FROM PUBLIC;
CREATE FUNCTION invalidate_current_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='boreholes' THEN
  IF NEW.technical_version=OLD.technical_version AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW;END IF;
  UPDATE reports r SET current_issue_id=NULL WHERE r.tenant_id=NEW.tenant_id AND r.work_id=NEW.work_id AND EXISTS(SELECT 1 FROM report_issues i,jsonb_array_elements(i.snapshot->'holes') h WHERE i.id=r.current_issue_id AND h->>'id'=NEW.id::text);
 ELSE
  UPDATE reports r SET current_issue_id=NULL WHERE r.tenant_id=NEW.tenant_id AND r.work_id=NEW.work_id AND EXISTS(SELECT 1 FROM report_issues i,jsonb_array_elements(i.snapshot->'photos') p WHERE i.id=r.current_issue_id AND p->>'id'=NEW.id::text);
 END IF;RETURN NEW;END $$;
CREATE TRIGGER invalidate_current_report AFTER UPDATE ON boreholes FOR EACH ROW EXECUTE FUNCTION invalidate_current_report();
CREATE TRIGGER invalidate_current_report_photo AFTER UPDATE ON borehole_photos FOR EACH ROW EXECUTE FUNCTION invalidate_current_report();
