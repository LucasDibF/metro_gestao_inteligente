CREATE TABLE mfa_credentials (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 secret_cipher TEXT NOT NULL,
 enabled_at TIMESTAMPTZ(3),
 pending_expires_at TIMESTAMPTZ(3),
 last_used_step BIGINT,
 recovery_hashes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
