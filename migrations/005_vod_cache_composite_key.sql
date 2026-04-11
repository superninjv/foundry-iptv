-- 005_vod_cache_composite_key.sql
-- Replace single-column primary key (stream_id) with a composite key
-- (media_type, stream_id) so movie and series ID spaces cannot collide.
-- Xtream providers reuse stream_id values across the movie and series
-- namespaces; the old key would silently overwrite one with the other.

ALTER TABLE iptv_vod_cache DROP CONSTRAINT IF EXISTS iptv_vod_cache_pkey;
ALTER TABLE iptv_vod_cache ADD PRIMARY KEY (media_type, stream_id);
