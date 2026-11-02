DROP POLICY spt_tests_insert ON spt_tests;
DROP POLICY spt_tests_update ON spt_tests;
CREATE POLICY spt_tests_insert ON spt_tests FOR INSERT WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL));
CREATE POLICY spt_tests_update ON spt_tests FOR UPDATE USING(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true)
 AND EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=spt_tests.tenant_id AND m.user_id::text=current_setting('app.user_id',true) AND m.active AND u.active AND m.role IN ('ADMIN','ENGINEER'))
 AND EXISTS(SELECT 1 FROM works w JOIN boreholes b ON b.work_id=w.id AND b.tenant_id=w.tenant_id WHERE b.id=spt_tests.borehole_id AND b.work_id=spt_tests.work_id AND b.tenant_id=spt_tests.tenant_id AND b.deleted_at IS NULL AND w.deleted_at IS NULL));
