CREATE FUNCTION renew_report_job(job_id UUID,token UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.report_issues SET lease_until=now()+interval '120 seconds' WHERE id=job_id AND state='PROCESSING' AND lease_token=token AND lease_until>now(); RETURN FOUND; END $$;
REVOKE ALL ON FUNCTION renew_report_job(UUID,UUID) FROM PUBLIC;
