-- Durable receipts and the field mutation commit in the same transaction.
CREATE TABLE mobile_operations (
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 user_id UUID NOT NULL REFERENCES users(id),
 operation_id UUID NOT NULL,
 work_id UUID NOT NULL,
 borehole_id UUID NOT NULL,
 request_hash TEXT NOT NULL,
 response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,user_id,operation_id),
 FOREIGN KEY (borehole_id,work_id,tenant_id) REFERENCES boreholes(id,work_id,tenant_id)
);
ALTER TABLE mobile_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY mobile_receipt_read ON mobile_operations FOR SELECT USING (
 tenant_id::text=current_setting('app.tenant_id',true)
 AND user_id::text=current_setting('app.user_id',true) AND app_has_role(ARRAY['OPERATOR'])
);
CREATE POLICY mobile_receipt_insert ON mobile_operations FOR INSERT WITH CHECK (
 tenant_id::text=current_setting('app.tenant_id',true)
 AND user_id::text=current_setting('app.user_id',true) AND app_has_role(ARRAY['OPERATOR'])
 AND EXISTS(SELECT 1 FROM work_assignments a WHERE a.work_id=mobile_operations.work_id
 AND a.tenant_id=mobile_operations.tenant_id AND a.operator_id=mobile_operations.user_id AND a.active)
);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='spt_runtime') THEN
 GRANT SELECT,INSERT ON mobile_operations TO spt_runtime;
END IF; END $$;
