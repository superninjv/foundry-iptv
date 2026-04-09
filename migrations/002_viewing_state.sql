-- 002_viewing_state.sql
-- Favorites, watch history, and user-managed channel lists (incl. parlay hook).

CREATE TABLE IF NOT EXISTS iptv_favorites (
    user_id    UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS iptv_watch_history (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
    channel_id   VARCHAR(255) NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    duration_sec INTEGER
);

CREATE INDEX IF NOT EXISTS iptv_watch_history_user_idx
    ON iptv_watch_history (user_id, started_at DESC);

-- Custom user lists: plain playlists, parlay cards (for the future betting app),
-- and dashboards (saved multiview layouts). Kind is a text check constraint so
-- adding new kinds later doesn't require an enum migration.
CREATE TABLE IF NOT EXISTS iptv_custom_lists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
    name       VARCHAR(255) NOT NULL,
    kind       VARCHAR(32) NOT NULL
                 CHECK (kind IN ('playlist', 'parlay', 'dashboard')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS iptv_custom_lists_user_idx ON iptv_custom_lists (user_id);

CREATE TABLE IF NOT EXISTS iptv_custom_list_channels (
    list_id    UUID NOT NULL REFERENCES iptv_custom_lists(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (list_id, channel_id)
);

CREATE INDEX IF NOT EXISTS iptv_custom_list_channels_pos_idx
    ON iptv_custom_list_channels (list_id, position);
