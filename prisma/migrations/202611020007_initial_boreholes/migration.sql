-- Commercial bootstrap is limited to a new work created by this function.
-- It never grants commercial users technical edit rights on existing holes.
CREATE FUNCTION create_work_with_boreholes(p_name text,p_client text,p_city text,p_state text,p_address text,p_count integer,p_folder text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE tenant uuid := nullif(current_setting('app.tenant_id',true),'')::uuid;
 work uuid := gen_random_uuid(); folder uuid; i integer;
BEGIN
 IF tenant IS NULL OR NOT public.app_has_role(ARRAY['ENGINEER','COMMERCIAL']) THEN RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE='42501'; END IF;
 IF p_count IS NULL OR p_count < 1 OR p_count > 200 OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
 OR length(p_client)>200 OR length(p_city)>120 OR length(p_state)>2 OR length(p_address)>500 OR length(p_folder)>120
 THEN RAISE EXCEPTION 'Invalid initial work data' USING ERRCODE='22023'; END IF;
 INSERT INTO public.works(id,tenant_id,name,client_name,city,state,address,updated_at)
 VALUES(work,tenant,btrim(p_name),p_client,p_city,p_state,p_address,now());
 IF nullif(btrim(p_folder),'') IS NOT NULL THEN
   folder := gen_random_uuid();
   INSERT INTO public.folders(id,work_id,tenant_id,name,updated_at) VALUES(folder,work,tenant,btrim(p_folder),now());
 END IF;
 FOR i IN 1..p_count LOOP
   INSERT INTO public.boreholes(id,work_id,tenant_id,folder_id,code,updated_at)
   VALUES(gen_random_uuid(),work,tenant,folder,'SP-' || lpad(i::text,greatest(2,length(i::text)),'0'),now());
 END LOOP;
 RETURN work;
END $$;
REVOKE ALL ON FUNCTION create_work_with_boreholes(text,text,text,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_work_with_boreholes(text,text,text,text,text,integer,text) TO spt_runtime;
