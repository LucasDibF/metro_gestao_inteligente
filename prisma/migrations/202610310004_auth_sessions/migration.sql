-- Authentication records are global identity infrastructure, like users.
-- Runtime access is limited to SELECT/INSERT/UPDATE; business tables retain RLS.
CREATE TABLE auth_sessions (
 id UUID PRIMARY KEY,
 family_id UUID NOT NULL,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 refresh_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ(3) NOT NULL,
 rotated_at TIMESTAMPTZ(3),
 revoked_at TIMESTAMPTZ(3),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_sessions_family_id_idx ON auth_sessions(family_id);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
