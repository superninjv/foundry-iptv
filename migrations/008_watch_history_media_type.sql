-- 008_watch_history_media_type.sql
-- Extend iptv_watch_history so VOD and series plays can be recorded alongside
-- live channel plays. The Series/VOD/Guide browse pages filter on this to
-- show only items the user has actually watched.

ALTER TABLE iptv_watch_history
    ADD COLUMN media_type TEXT NOT NULL DEFAULT 'live'
        CHECK (media_type IN ('live', 'vod', 'series')),
    ADD COLUMN vod_stream_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_history_user_media
    ON iptv_watch_history (user_id, media_type, started_at DESC);
