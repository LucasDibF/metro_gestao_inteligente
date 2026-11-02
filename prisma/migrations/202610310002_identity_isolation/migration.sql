CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'ENGINEER', 'OPERATOR', 'VIEWER');
CREATE TABLE users (
 id UUID PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)))
);
CREATE TABLE memberships (
 tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 role "MembershipRole" NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true,
 PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_id_idx ON memberships(user_id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

-- Context must be scoped to the current transaction, after authentication.
CREATE POLICY membership_read ON memberships FOR SELECT USING (
 tenant_id::text = current_setting('app.tenant_id', true)
 AND user_id::text = current_setting('app.user_id', true)
 AND active
);
CREATE POLICY tenant_read ON tenants FOR SELECT USING (
 id::text = current_setting('app.tenant_id', true)
 AND EXISTS (
   SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
   WHERE m.tenant_id = tenants.id
     AND m.user_id::text = current_setting('app.user_id', true)
     AND m.active AND u.active
 )
);
-- No runtime write policies until the corresponding authorized workflows exist.
