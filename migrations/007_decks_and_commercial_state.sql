-- 007_decks_and_commercial_state.sql
-- Superplayer decks: small, named, event-oriented watch sessions with TTL'd
-- channel entries, optional multiview presets, and per-deck skip-commercials.
-- Commercial state is populated by the ts2hls detector; rows older than 60s
-- are treated as fail-open (not in commercial) by the deck cycling logic.

CREATE TABLE iptv_superplayer_decks (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES iptv_users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    view_mode         TEXT NOT NULL DEFAULT 'single' CHECK (view_mode IN ('single','multi')),
    cursor_index      INTEGER NOT NULL DEFAULT 0,
    skip_commercials  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sp_decks_user ON iptv_superplayer_decks(user_id, updated_at DESC);

CREATE TABLE iptv_superplayer_entries (
    id          BIGSERIAL PRIMARY KEY,
    deck_id     BIGINT NOT NULL REFERENCES iptv_superplayer_decks(id) ON DELETE CASCADE,
    channel_id  VARCHAR(255) NOT NULL,
    position    INTEGER NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    UNIQUE (deck_id, position)
);
CREATE INDEX idx_sp_entries_deck ON iptv_superplayer_entries(deck_id, position);
CREATE INDEX idx_sp_entries_expires ON iptv_superplayer_entries(expires_at);

CREATE TABLE iptv_superplayer_presets (
    id          BIGSERIAL PRIMARY KEY,
    deck_id     BIGINT NOT NULL REFERENCES iptv_superplayer_decks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    layout      TEXT NOT NULL CHECK (layout IN ('2x2','3x3','1+3','2+4')),
    channel_ids TEXT[] NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (deck_id, position)
);

CREATE TABLE iptv_channel_commercial_state (
    channel_id    VARCHAR(255) PRIMARY KEY,
    in_commercial BOOLEAN NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confidence    REAL NOT NULL DEFAULT 0.0,
    source        TEXT NOT NULL
);
CREATE INDEX idx_commercial_updated ON iptv_channel_commercial_state(updated_at DESC);
