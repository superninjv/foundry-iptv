-- 009_admin_startup.sql
-- Admin household settings, config KV, device tokens, and device pairing codes.
-- Single-tenant: no tenant_id. All admin actions gated by iptv_users.is_admin.

CREATE TABLE iptv_household_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  default_deck_id BIGINT REFERENCES iptv_superplayer_decks(id) ON DELETE SET NULL,
  default_view_mode TEXT CHECK (default_view_mode IN ('single','multi')) DEFAULT 'single',
  allow_user_override BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES iptv_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO iptv_household_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE iptv_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE iptv_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- sha256 of raw token
  label TEXT NOT NULL,              -- e.g. "Living Room FireStick"
  platform TEXT NOT NULL,           -- 'firestick', 'streaming-pc', 'desktop', etc
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,           -- NULL = never
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_device_tokens_user ON iptv_device_tokens(user_id) WHERE revoked_at IS NULL;

CREATE TABLE iptv_device_pairing_codes (
  code TEXT PRIMARY KEY,            -- 8-char human-typable, e.g. "FOUN-D1R2"
  created_by UUID NOT NULL REFERENCES iptv_users(id),
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,  -- short TTL, 10 min
  consumed_at TIMESTAMPTZ,
  consumed_token_id UUID REFERENCES iptv_device_tokens(id)
);

ALTER TABLE iptv_users ADD COLUMN can_manage_sessions BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE iptv_users SET can_manage_sessions = TRUE WHERE is_admin = TRUE;
