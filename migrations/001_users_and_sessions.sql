-- 001_users_and_sessions.sql
-- Foundry IPTV — accounts and session tracking.
-- Single-tenant home app: no tenant_id, no RLS, iptv_* prefix only.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS iptv_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(255),
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS iptv_users_email_idx ON iptv_users (LOWER(email));

CREATE TABLE IF NOT EXISTS iptv_sessions (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS iptv_sessions_user_idx   ON iptv_sessions (user_id);
CREATE INDEX IF NOT EXISTS iptv_sessions_expires_idx ON iptv_sessions (expires_at);
