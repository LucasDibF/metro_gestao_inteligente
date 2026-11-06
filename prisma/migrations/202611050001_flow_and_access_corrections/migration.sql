-- Correções de fluxo técnico, invalidação de relatório, fila e atribuição de campo.
-- Reversão: reaplicar as definições anteriores (official_coordinate_changed 202610310014; invalidate_current_report e fail_report_job 202610310015; invalidate_technical_review e bump_technical_parent 202611020001; admin_member_update 202611020002), remover os índices abaixo e rodar npm run dev:setup para recriar set_local_test_role. Nenhum dado é apagado aqui.

-- 1 e 4. Coordenada oficial: furo em revisão ou aprovado volta a IN_REVIEW, nunca reabre o campo. DRAFT mantém a orientação da devolução.
CREATE OR REPLACE FUNCTION official_coordinate_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM boreholes b WHERE b.id=NEW.borehole_id AND b.official_coordinate_id=NEW.id) THEN
 UPDATE boreholes SET technical_version=technical_version+1,review_state=CASE WHEN review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END,approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,review_note=CASE WHEN review_state='DRAFT' THEN review_note END,version=version+1 WHERE id=NEW.borehole_id;
 END IF;RETURN NEW;END $$;

-- 2. Roda com o direito do dono porque a política de reports só permite UPDATE a ENGINEER e a invalidação vale para qualquer autor (ADMIN excluindo furo, sondador em DRAFT).
-- Requisito de produção: reports e report_issues têm FORCE RLS, então o dono desta função precisa ser superusuário ou ter BYPASSRLS. Com outro dono o UPDATE afeta 0 linhas sem erro. O escopo vem de NEW.tenant_id e NEW.work_id.
-- Atualizações só de fila (claim/finish/fail do worker) não alteram a composição da foto e saem cedo, sem abrir snapshots.
CREATE OR REPLACE FUNCTION invalidate_current_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_TABLE_NAME='boreholes' THEN
  IF NEW.technical_version=OLD.technical_version AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW;END IF;
  UPDATE public.reports r SET current_issue_id=NULL WHERE r.tenant_id=NEW.tenant_id AND r.work_id=NEW.work_id AND r.current_issue_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.report_issues i,jsonb_array_elements(i.snapshot->'holes') h WHERE i.id=r.current_issue_id AND h->>'id'=NEW.id::text);
 ELSE
  IF NEW.caption IS NOT DISTINCT FROM OLD.caption AND NEW.crop IS NOT DISTINCT FROM OLD.crop AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.version IS NOT DISTINCT FROM OLD.version THEN RETURN NEW;END IF;
  UPDATE public.reports r SET current_issue_id=NULL WHERE r.tenant_id=NEW.tenant_id AND r.work_id=NEW.work_id AND r.current_issue_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.report_issues i,jsonb_array_elements(i.snapshot->'photos') p WHERE i.id=r.current_issue_id AND p->>'id'=NEW.id::text);
 END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION invalidate_current_report() FROM PUBLIC;

-- 3. Falha definitiva registra finished_at. A retentativa continua igual.
CREATE OR REPLACE FUNCTION fail_report_job(job_id UUID,token UUID,permanent BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.report_issues SET state=CASE WHEN permanent OR attempts>=3 THEN 'FAILED' ELSE 'PENDING' END,finished_at=CASE WHEN permanent OR attempts>=3 THEN now() ELSE finished_at END,available_at=now()+make_interval(secs=>power(2,attempts)::integer*5),error_code=CASE WHEN permanent THEN 'INVALID_SNAPSHOT' ELSE 'GENERATION_FAILED' END,lease_token=NULL,lease_until=NULL WHERE id=job_id AND state='PROCESSING' AND lease_token=token AND lease_until>now();RETURN FOUND;END $$;

-- 4. Em DRAFT o sondador continua lendo o motivo da devolução. Em IN_REVIEW e APPROVED a nota é limpa como antes.
CREATE OR REPLACE FUNCTION invalidate_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.executed_depth_m IS DISTINCT FROM OLD.executed_depth_m OR NEW.water_level_m IS DISTINCT FROM OLD.water_level_m OR NEW.field_date IS DISTINCT FROM OLD.field_date OR NEW.official_coordinate_id IS DISTINCT FROM OLD.official_coordinate_id THEN
 NEW.technical_version=OLD.technical_version+1;NEW.review_state=CASE WHEN OLD.review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END;NEW.approved_version=NULL;NEW.reviewed_by=NULL;NEW.reviewed_at=NULL;NEW.reviewer_name=NULL;NEW.reviewer_registration=NULL;NEW.review_note=CASE WHEN OLD.review_state='DRAFT' THEN NEW.review_note END;
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION bump_technical_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor UUID;
BEGIN
 actor=NULLIF(current_setting('app.user_id',true),'')::uuid;
 UPDATE boreholes SET technical_version=technical_version+1,review_state=CASE WHEN review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END,approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,review_note=CASE WHEN review_state='DRAFT' THEN review_note END WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id;
 IF actor IS NOT NULL THEN
 INSERT INTO technical_events(id,tenant_id,work_id,borehole_id,actor_id,action,technical_version,details)
 SELECT gen_random_uuid(),NEW.tenant_id,NEW.work_id,NEW.borehole_id,actor,TG_TABLE_NAME||'_'||TG_OP,b.technical_version,jsonb_build_object('recordId',NEW.id) FROM boreholes b WHERE b.id=NEW.borehole_id;
 END IF;
 RETURN NEW;
END $$;

-- 5. Quem deixa de ser sondador ativo perde as atribuições na empresa. Reativar o vínculo não restaura atribuição: exige nova designação.
CREATE OR REPLACE FUNCTION admin_member_update(uid UUID,roles "MembershipRole"[],enabled BOOLEAN,download BOOLEAN,expected INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE tid UUID=NULLIF(current_setting('app.tenant_id',true),'')::uuid; current_row public.memberships; admins INTEGER; BEGIN
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
 IF NOT enabled OR NOT ('OPERATOR'::public."MembershipRole"=ANY(roles)) THEN UPDATE public.work_assignments SET active=false,version=version+1,updated_at=now() WHERE tenant_id=tid AND operator_id=uid AND active; END IF;
 INSERT INTO public.membership_events(tenant_id,actor_id,user_id,action,details) VALUES(tid,current_setting('app.user_id')::uuid,uid,'ACCESS_UPDATED',jsonb_build_object('previousRoles',array_prepend(current_row.role,current_row.additional_roles),'roles',roles,'active',enabled,'canDownloadReports',download));
 RETURN true;
END $$;

-- 6. Função exclusiva de desenvolvimento: passa a ser criada só por scripts/setup-development-access.ts (npm run dev:setup). Quem aplicar esta migration em ambiente local precisa rodar o script de novo.
DROP FUNCTION IF EXISTS set_local_test_role(UUID,UUID,TEXT);

-- 7. Ainda não há produção, por isso CREATE INDEX comum dentro da transação. Em produção se usaria CREATE INDEX CONCURRENTLY, em migration sem transação.
CREATE INDEX IF NOT EXISTS reports_tenant_work_created_idx ON reports(tenant_id,work_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS borehole_photos_active_scope_idx ON borehole_photos(tenant_id,work_id,borehole_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS borehole_photos_queue_idx ON borehole_photos(created_at,id) WHERE processing_state IN ('PENDING','PROCESSING');
CREATE INDEX IF NOT EXISTS auth_sessions_active_family_idx ON auth_sessions(family_id) WHERE revoked_at IS NULL AND rotated_at IS NULL;
