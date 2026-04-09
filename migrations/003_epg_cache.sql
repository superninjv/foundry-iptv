-- 003_epg_cache.sql
-- EPG cache with optional pgvector embedding column for AI semantic search (Phase 3).
-- Extensions are idempotent so running the migration on a fresh DB just works.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS iptv_epg_cache (
    channel_id  VARCHAR(255) NOT NULL,
    start_at    TIMESTAMPTZ NOT NULL,
    end_at      TIMESTAMPTZ NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    category    VARCHAR(255),
    -- nomic-embed-text = 768 dims. nullable until the nightly job fills it.
    embedding   vector(768),
    PRIMARY KEY (channel_id, start_at)
);

-- Text search indexes for Phase 3 search.
CREATE INDEX IF NOT EXISTS iptv_epg_cache_title_trgm_idx
    ON iptv_epg_cache USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS iptv_epg_cache_start_idx
    ON iptv_epg_cache (start_at);

CREATE INDEX IF NOT EXISTS iptv_epg_cache_channel_start_idx
    ON iptv_epg_cache (channel_id, start_at);

-- Vector index added later, once we have enough rows to matter.
-- TODO Phase 3: CREATE INDEX iptv_epg_cache_embedding_idx ON iptv_epg_cache
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
