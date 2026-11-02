ALTER TABLE borehole_photos ADD COLUMN processing_state VARCHAR(20) NOT NULL DEFAULT 'READY' CHECK(processing_state IN ('PENDING','PROCESSING','READY','FAILED')),
 ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,ADD COLUMN available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,ADD COLUMN lease_token UUID,ADD COLUMN lease_until TIMESTAMPTZ(3),ADD COLUMN error_code VARCHAR(60);
ALTER TABLE borehole_photos ALTER COLUMN processing_state SET DEFAULT 'PENDING';
CREATE FUNCTION claim_photo_job(only_photo UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE photo public.borehole_photos;BEGIN
 UPDATE public.borehole_photos SET processing_state='FAILED',error_code='RETRIES_EXHAUSTED',lease_token=NULL,lease_until=NULL WHERE (only_photo IS NULL OR id=only_photo) AND attempts>=3 AND (processing_state='PENDING' OR (processing_state='PROCESSING' AND lease_until<now()));
 SELECT * INTO photo FROM public.borehole_photos WHERE deleted_at IS NULL AND (only_photo IS NULL OR id=only_photo) AND attempts<3 AND ((processing_state='PENDING' AND available_at<=now()) OR (processing_state='PROCESSING' AND lease_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.borehole_photos SET processing_state='PROCESSING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',error_code=NULL WHERE id=photo.id RETURNING * INTO photo;
 RETURN jsonb_build_object('id',photo.id,'tenantId',photo.tenant_id,'workId',photo.work_id,'leaseToken',photo.lease_token,'objectKey',photo.object_key,'thumbnailKey',photo.thumbnail_key,'sha256',photo.sha256);
END $$;
CREATE FUNCTION finish_photo_job(photo_id UUID,token UUID,lat DOUBLE PRECISION,lon DOUBLE PRECISION) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF (lat IS NULL)<>(lon IS NULL) OR lat < -90 OR lat > 90 OR lon < -180 OR lon >180 THEN RETURN FALSE;END IF;
 UPDATE public.borehole_photos SET processing_state='READY',gps_latitude=lat,gps_longitude=lon,lease_token=NULL,lease_until=NULL WHERE id=photo_id AND deleted_at IS NULL AND processing_state='PROCESSING' AND lease_token=token AND lease_until>now();RETURN FOUND;END $$;
CREATE FUNCTION fail_photo_job(photo_id UUID,token UUID,permanent BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 UPDATE public.borehole_photos SET processing_state=CASE WHEN permanent OR attempts>=3 THEN 'FAILED' ELSE 'PENDING' END,error_code=CASE WHEN permanent THEN 'INVALID_IMAGE' ELSE 'IMAGE_PROCESSING_FAILED' END,available_at=now()+interval '10 seconds',lease_token=NULL,lease_until=NULL WHERE id=photo_id AND processing_state='PROCESSING' AND lease_token=token AND lease_until>now();RETURN FOUND;END $$;
REVOKE ALL ON FUNCTION claim_photo_job(UUID),finish_photo_job(UUID,UUID,DOUBLE PRECISION,DOUBLE PRECISION),fail_photo_job(UUID,UUID,BOOLEAN) FROM PUBLIC;
CREATE OR REPLACE FUNCTION protect_photo_original() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.object_key<>OLD.object_key OR NEW.thumbnail_key<>OLD.thumbnail_key OR NEW.sha256<>OLD.sha256 OR NEW.mime<>OLD.mime OR NEW.size_bytes<>OLD.size_bytes OR NEW.width<>OLD.width OR NEW.height<>OLD.height OR ((NEW.gps_latitude IS DISTINCT FROM OLD.gps_latitude OR NEW.gps_longitude IS DISTINCT FROM OLD.gps_longitude) AND NOT (OLD.processing_state='PROCESSING' AND NEW.processing_state='READY')) THEN RAISE EXCEPTION 'Photo original is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
