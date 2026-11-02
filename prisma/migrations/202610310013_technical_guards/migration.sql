CREATE FUNCTION protect_soil_layer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.borehole_id<>OLD.borehole_id OR NEW.work_id<>OLD.work_id OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Layer identity is immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM works WHERE id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work unavailable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM boreholes WHERE id=NEW.borehole_id AND work_id=NEW.work_id AND tenant_id=NEW.tenant_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Borehole unavailable' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM soil_layers s WHERE s.borehole_id=NEW.borehole_id AND s.work_id=NEW.work_id AND s.tenant_id=NEW.tenant_id AND s.id<>NEW.id AND NEW.from_m<s.to_m AND NEW.to_m>s.from_m) THEN RAISE EXCEPTION 'Overlapping layers' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER soil_parent BEFORE INSERT OR UPDATE ON soil_layers FOR EACH ROW EXECUTE FUNCTION protect_soil_layer();
CREATE FUNCTION protect_review_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.review_state='APPROVED' AND (OLD.review_state IS DISTINCT FROM NEW.review_state OR NEW.approved_version IS DISTINCT FROM OLD.approved_version) THEN
  IF OLD.review_state<>'IN_REVIEW' OR NEW.approved_version<>OLD.technical_version OR NEW.technical_version<>OLD.technical_version OR NEW.reviewed_by::text IS DISTINCT FROM current_setting('app.user_id',true) OR NOT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=NEW.tenant_id AND m.user_id=NEW.reviewed_by AND m.active AND u.active AND m.role='ENGINEER') THEN RAISE EXCEPTION 'Invalid technical approval' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_review_transition BEFORE UPDATE ON boreholes FOR EACH ROW EXECUTE FUNCTION protect_review_transition();
