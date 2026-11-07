-- Perfil profissional do engenheiro por vínculo (empresa e usuário) e cópia do título no furo aprovado.
-- Só acrescenta: tabela nova, coluna nula em boreholes e as três funções de invalidação limpando também reviewer_title.
-- Reversão: reaplicar official_coordinate_changed, invalidate_technical_review e bump_technical_parent de
-- 202611050001_flow_and_access_corrections; DROP TABLE professional_profiles; ALTER TABLE boreholes DROP COLUMN reviewer_title;
-- apagar a linha desta migração em _prisma_migrations. A reversão perde os perfis e os títulos gravados: exige backup antes.

-- Uma linha por vínculo. A chave (tenant_id,user_id) é estável e serve de âncora para a futura seção "Minha assinatura".
-- Nome, CREA e título são nulos enquanto o perfil estiver incompleto: "sem linha" = sem perfil, "linha com nulo" = incompleto.
CREATE TABLE professional_profiles (
 tenant_id UUID NOT NULL,
 user_id UUID NOT NULL,
 full_name VARCHAR(200) CHECK(full_name IS NULL OR length(trim(full_name))>0),
 crea_number VARCHAR(20) CHECK(crea_number IS NULL OR length(trim(crea_number))>0),
 crea_uf CHAR(2) CHECK(crea_uf IS NULL OR crea_uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 professional_title VARCHAR(120) CHECK(professional_title IS NULL OR length(trim(professional_title))>0),
 phone VARCHAR(30) CHECK(phone IS NULL OR length(trim(phone))>0),
 professional_email VARCHAR(254) CHECK(professional_email IS NULL OR length(trim(professional_email))>0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id) ON DELETE RESTRICT
);
ALTER TABLE professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_profiles FORCE ROW LEVEL SECURITY;
-- Cada um lê só o próprio perfil na empresa do contexto. Escrita só pelo próprio usuário, com vínculo ativo de ENGINEER.
CREATE POLICY professional_profile_read ON professional_profiles FOR SELECT USING (
 tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
);
CREATE POLICY professional_profile_insert ON professional_profiles FOR INSERT WITH CHECK (
 tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
 AND app_has_role(ARRAY['ENGINEER'])
);
CREATE POLICY professional_profile_update ON professional_profiles FOR UPDATE USING (
 tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
 AND app_has_role(ARRAY['ENGINEER'])
) WITH CHECK (
 tenant_id::text=current_setting('app.tenant_id',true) AND user_id::text=current_setting('app.user_id',true)
 AND app_has_role(ARRAY['ENGINEER'])
);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN
 GRANT SELECT,INSERT,UPDATE ON professional_profiles TO spt_runtime;
END IF; END $$;

-- Cópia do título no furo, ao lado de reviewer_name e reviewer_registration. Sem backfill: aprovações antigas ficam nulas.
ALTER TABLE boreholes ADD COLUMN reviewer_title VARCHAR(120) CHECK(reviewer_title IS NULL OR length(trim(reviewer_title))>0);

-- Mesmas definições de 202611050001, acrescentando reviewer_title=NULL onde a aprovação é desfeita.
CREATE OR REPLACE FUNCTION official_coordinate_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM boreholes b WHERE b.id=NEW.borehole_id AND b.official_coordinate_id=NEW.id) THEN
 UPDATE boreholes SET technical_version=technical_version+1,review_state=CASE WHEN review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END,approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,reviewer_title=NULL,review_note=CASE WHEN review_state='DRAFT' THEN review_note END,version=version+1 WHERE id=NEW.borehole_id;
 END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION invalidate_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.executed_depth_m IS DISTINCT FROM OLD.executed_depth_m OR NEW.water_level_m IS DISTINCT FROM OLD.water_level_m OR NEW.field_date IS DISTINCT FROM OLD.field_date OR NEW.official_coordinate_id IS DISTINCT FROM OLD.official_coordinate_id THEN
 NEW.technical_version=OLD.technical_version+1;NEW.review_state=CASE WHEN OLD.review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END;NEW.approved_version=NULL;NEW.reviewed_by=NULL;NEW.reviewed_at=NULL;NEW.reviewer_name=NULL;NEW.reviewer_registration=NULL;NEW.reviewer_title=NULL;NEW.review_note=CASE WHEN OLD.review_state='DRAFT' THEN NEW.review_note END;
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION bump_technical_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor UUID;
BEGIN
 actor=NULLIF(current_setting('app.user_id',true),'')::uuid;
 UPDATE boreholes SET technical_version=technical_version+1,review_state=CASE WHEN review_state='DRAFT' THEN 'DRAFT' ELSE 'IN_REVIEW' END,approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,reviewer_title=NULL,review_note=CASE WHEN review_state='DRAFT' THEN review_note END WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id;
 IF actor IS NOT NULL THEN
 INSERT INTO technical_events(id,tenant_id,work_id,borehole_id,actor_id,action,technical_version,details)
 SELECT gen_random_uuid(),NEW.tenant_id,NEW.work_id,NEW.borehole_id,actor,TG_TABLE_NAME||'_'||TG_OP,b.technical_version,jsonb_build_object('recordId',NEW.id) FROM boreholes b WHERE b.id=NEW.borehole_id;
 END IF;
 RETURN NEW;
END $$;
