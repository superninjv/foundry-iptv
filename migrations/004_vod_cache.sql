-- 004_vod_cache.sql
-- Cache for VOD movies and series metadata from the Xtream API.
-- Populated by the ingest script, searched via pg_trgm.

CREATE TABLE IF NOT EXISTS iptv_vod_cache (
    stream_id       INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    plot            TEXT,
    cast_info       TEXT,
    director        TEXT,
    genre           TEXT,
    rating          VARCHAR(16),
    cover           TEXT,
    release_date    VARCHAR(32),
    duration        VARCHAR(32),
    container_ext   VARCHAR(16),
    category_name   VARCHAR(255),
    media_type      VARCHAR(16) NOT NULL CHECK (media_type IN ('movie', 'series')),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS iptv_vod_cache_name_trgm_idx
    ON iptv_vod_cache USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS iptv_vod_cache_type_idx
    ON iptv_vod_cache (media_type);

CREATE INDEX IF NOT EXISTS iptv_vod_cache_genre_trgm_idx
    ON iptv_vod_cache USING gin (genre gin_trgm_ops);
