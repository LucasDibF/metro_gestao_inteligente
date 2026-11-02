CREATE TABLE borehole_coordinates (
 id UUID PRIMARY KEY,borehole_id UUID NOT NULL,work_id UUID NOT NULL,tenant_id UUID NOT NULL,
 kind VARCHAR(10) NOT NULL CHECK(kind IN ('PLANNED','EXECUTED')),
 easting_m DECIMAL(11,2) NOT NULL CHECK(easting_m>=100000 AND easting_m<=900000),northing_m DECIMAL(11,2) NOT NULL CHECK(northing_m>=0 AND northing_m<=10000000),
 zone INTEGER NOT NULL CHECK(zone>=1 AND zone<=60),hemisphere CHAR(1) NOT NULL CHECK(hemisphere IN ('N','S')),datum VARCHAR(20) NOT NULL DEFAULT 'SIRGAS2000' CHECK(datum='SIRGAS2000'),altitude_m DECIMAL(9,2),reference VARCHAR(500) NOT NULL,
 latitude DOUBLE PRECISION NOT NULL,longitude DOUBLE PRECISION NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id) ON DELETE RESTRICT,
 UNIQUE(borehole_id,work_id,tenant_id,kind),UNIQUE(id,borehole_id,work_id,tenant_id)
);
ALTER TABLE boreholes ADD COLUMN official_coordinate_id UUID;
ALTER TABLE boreholes ADD CONSTRAINT boreholes_official_coordinate_fkey FOREIGN KEY(official_coordinate_id,id,work_id,tenant_id) REFERENCES borehole_coordinates(id,borehole_id,work_id,tenant_id) ON DELETE RESTRICT;
CREATE TABLE borehole_photos (
 id UUID PRIMARY KEY,borehole_id UUID NOT NULL,work_id UUID NOT NULL,tenant_id UUID NOT NULL,
 object_key TEXT NOT NULL UNIQUE,thumbnail_key TEXT NOT NULL UNIQUE,sha256 CHAR(64) NOT NULL,mime VARCHAR(30) NOT NULL CHECK(mime IN ('image/jpeg','image/png')),size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),
 caption VARCHAR(500) NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,gps_latitude DOUBLE PRECISION,gps_longitude DOUBLE PRECISION,
 crop JSONB NOT NULL DEFAULT '{"x":0,"y":0,"width":1,"height":1}',version INTEGER NOT NULL DEFAULT 1,deleted_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id) ON DELETE RESTRICT
);
ALTER TABLE borehole_coordinates ENABLE ROW LEVEL SECURITY; ALTER TABLE borehole_coordinates FORCE ROW LEVEL SECURITY;
ALTER TABLE borehole_photos ENABLE ROW LEVEL SECURITY; ALTER TABLE borehole_photos FORCE ROW LEVEL SECURITY;
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['borehole_coordinates','borehole_photos'] LOOP
 EXECUTE format('CREATE POLICY scoped_read ON %I FOR SELECT USING(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=%I.borehole_id AND b.work_id=%I.work_id AND b.tenant_id=%I.tenant_id AND b.deleted_at IS NULL))',t,t,t,t);
 EXECUTE format('CREATE POLICY scoped_insert ON %I FOR INSERT WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=%I.borehole_id AND b.work_id=%I.work_id AND b.tenant_id=%I.tenant_id AND b.deleted_at IS NULL) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=%I.tenant_id AND m.user_id::text=current_setting(''app.user_id'',true) AND m.active AND u.active AND m.role IN (''ADMIN'',''ENGINEER'')))',t,t,t,t,t);
 EXECUTE format('CREATE POLICY scoped_update ON %I FOR UPDATE USING(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=%I.tenant_id AND m.user_id::text=current_setting(''app.user_id'',true) AND m.active AND u.active AND m.role IN (''ADMIN'',''ENGINEER''))) WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true) AND EXISTS(SELECT 1 FROM boreholes b WHERE b.id=%I.borehole_id AND b.work_id=%I.work_id AND b.tenant_id=%I.tenant_id AND b.deleted_at IS NULL))',t,t,t,t,t);
 END LOOP; END $$;
CREATE FUNCTION protect_file_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.borehole_id<>OLD.borehole_id OR NEW.work_id<>OLD.work_id OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Identity is immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM works WHERE id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work unavailable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM boreholes WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Borehole unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coordinates_parent BEFORE INSERT OR UPDATE ON borehole_coordinates FOR EACH ROW EXECUTE FUNCTION protect_file_parent();
CREATE TRIGGER photos_parent BEFORE INSERT OR UPDATE ON borehole_photos FOR EACH ROW EXECUTE FUNCTION protect_file_parent();
CREATE FUNCTION official_coordinate_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM boreholes b WHERE b.id=NEW.borehole_id AND b.official_coordinate_id=NEW.id) THEN
 UPDATE boreholes SET technical_version=technical_version+1,review_state='DRAFT',approved_version=NULL,reviewed_by=NULL,reviewed_at=NULL,reviewer_name=NULL,reviewer_registration=NULL,review_note=NULL,version=version+1 WHERE id=NEW.borehole_id;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER official_coordinate_changed AFTER UPDATE ON borehole_coordinates FOR EACH ROW EXECUTE FUNCTION official_coordinate_changed();
CREATE OR REPLACE FUNCTION invalidate_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR NEW.executed_depth_m IS DISTINCT FROM OLD.executed_depth_m OR NEW.water_level_m IS DISTINCT FROM OLD.water_level_m OR NEW.field_date IS DISTINCT FROM OLD.field_date OR NEW.official_coordinate_id IS DISTINCT FROM OLD.official_coordinate_id THEN
 NEW.technical_version=OLD.technical_version+1;NEW.review_state='DRAFT';NEW.approved_version=NULL;NEW.reviewed_by=NULL;NEW.reviewed_at=NULL;NEW.reviewer_name=NULL;NEW.reviewer_registration=NULL;NEW.review_note=NULL;
 END IF; RETURN NEW; END $$;
