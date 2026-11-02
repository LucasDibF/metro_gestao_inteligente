DROP FUNCTION claim_report_job();
CREATE FUNCTION claim_report_job(only_job UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.report_issues;BEGIN
 UPDATE public.report_issues SET state='FAILED',error_code='RETRIES_EXHAUSTED',finished_at=now(),lease_token=NULL,lease_until=NULL WHERE (only_job IS NULL OR id=only_job) AND attempts>=3 AND (state='PENDING' OR (state='PROCESSING' AND lease_until<now()));
 SELECT * INTO job FROM public.report_issues WHERE (only_job IS NULL OR id=only_job) AND attempts<3 AND ((state='PENDING' AND available_at<=now()) OR (state='PROCESSING' AND lease_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.report_issues SET state='PROCESSING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',error_code=NULL WHERE id=job.id RETURNING * INTO job;
 RETURN jsonb_build_object('id',job.id,'tenantId',job.tenant_id,'workId',job.work_id,'reportId',job.report_id,'leaseToken',job.lease_token,'snapshot',job.snapshot,'snapshotHash',job.snapshot_hash,'attempts',job.attempts);
END $$;
REVOKE ALL ON FUNCTION claim_report_job(UUID) FROM PUBLIC;
