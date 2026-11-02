CREATE OR REPLACE FUNCTION publish_report_job(job_id UUID,token UUID,object_key_value TEXT,sha_value TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.report_issues; r public.reports;BEGIN
 SELECT * INTO job FROM public.report_issues WHERE id=job_id;
 IF NOT FOUND THEN RETURN FALSE;END IF;
 PERFORM id FROM public.works WHERE id=job.work_id FOR UPDATE;
 SELECT * INTO r FROM public.reports WHERE id=job.report_id FOR UPDATE;
 SELECT * INTO job FROM public.report_issues WHERE id=job_id FOR UPDATE;
 IF token IS NULL OR sha_value IS NULL OR object_key_value IS NULL OR job.state<>'PROCESSING' OR job.lease_token IS DISTINCT FROM token OR job.lease_until IS NULL OR job.lease_until<=now() OR sha_value!~'^[0-9a-f]{64}$' OR object_key_value<>job.tenant_id::text||'/'||job.work_id::text||'/reports/'||job.id::text||'/'||sha_value||'.pdf' THEN RETURN FALSE;END IF;
 UPDATE public.report_issues SET state='READY',object_key=object_key_value,pdf_sha256=sha_value,finished_at=now(),lease_token=NULL,lease_until=NULL WHERE id=job.id;
 IF r.version=job.composition_version AND r.issue_counter=job.issue_number
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.snapshot->'holes') h LEFT JOIN public.boreholes b ON b.id=(h->>'id')::uuid AND b.work_id=job.work_id AND b.tenant_id=job.tenant_id WHERE b.id IS NULL OR b.deleted_at IS NOT NULL OR b.review_state<>'APPROVED' OR b.technical_version<>(h->>'technicalVersion')::integer OR b.approved_version<>b.technical_version)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(job.snapshot->'photos') p LEFT JOIN public.borehole_photos f ON f.id=(p->>'id')::uuid AND f.tenant_id=job.tenant_id AND f.work_id=job.work_id WHERE f.id IS NULL OR f.deleted_at IS NOT NULL OR f.version<>(p->>'version')::integer)
 AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=job.work_id AND w.deleted_at IS NULL) THEN UPDATE public.reports SET current_issue_id=job.id WHERE id=r.id;END IF;
 RETURN TRUE;
END $$;
ALTER TABLE report_issues ADD CONSTRAINT ready_issue_has_pdf CHECK(state<>'READY' OR (object_key IS NOT NULL AND pdf_sha256 IS NOT NULL AND finished_at IS NOT NULL));
ALTER TABLE report_issues ADD CONSTRAINT processing_issue_has_lease CHECK(state<>'PROCESSING' OR (lease_token IS NOT NULL AND lease_until IS NOT NULL));
