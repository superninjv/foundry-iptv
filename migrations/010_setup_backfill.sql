-- 010: mark setup_complete for existing installs so the setup wizard
-- doesn't lock out households that upgraded from a pre-wave-1 build.
--
-- Heuristic: if iptv_users has at least one row, the household already
-- went through the legacy seed-admin flow. Skip the wizard.
-- Fresh installs have an empty users table and will be redirected to
-- /setup by the middleware gate as intended.

INSERT INTO iptv_config (key, value)
SELECT 'setup_complete', 'true'
WHERE EXISTS (SELECT 1 FROM iptv_users LIMIT 1)
ON CONFLICT (key) DO NOTHING;
