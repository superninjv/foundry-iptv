-- 006_clean_legacy_channel_data.sql
-- Wipe channel-keyed tables that referenced Threadfin's numeric XEPG IDs.
-- After this migration, channel IDs are derived from sha1(providerUrl) by
-- src/lib/threadfin/client.ts, so any cached row using the old scheme is an
-- orphan that can never be re-linked. Truncate them so future writes start
-- clean against the new ID scheme.
--
-- Foundry IPTV is single-tenant dev — there is no migration path for the
-- existing favorite/history rows. Wipe is the simplest correct option.

TRUNCATE TABLE iptv_epg_cache;
TRUNCATE TABLE iptv_favorites;
TRUNCATE TABLE iptv_watch_history;
TRUNCATE TABLE iptv_custom_list_channels;
