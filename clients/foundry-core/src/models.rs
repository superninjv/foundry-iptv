use serde::{Deserialize, Serialize};

/// A live TV channel returned by GET /api/channels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    /// Category / group (maps to M3U group-title).
    pub group: Option<String>,
    pub logo_url: Option<String>,
    pub tvg_id: Option<String>,
}

/// A channel category returned by GET /api/channels/categories.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub channel_count: u32,
}

/// A single EPG programme entry returned by GET /api/epg/<channelId>.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpgEntry {
    pub channel_id: String,
    /// Programme start (RFC 3339).
    pub start: chrono::DateTime<chrono::Utc>,
    /// Programme end (RFC 3339).
    pub end: chrono::DateTime<chrono::Utc>,
    pub title: String,
    pub description: Option<String>,
}

/// An active HLS stream session returned by POST /api/stream/<channelId>.
/// The `hls_url` points at the ts2hls proxy and is ready to pass straight to
/// GStreamer / ExoPlayer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamSession {
    /// Server-side session identifier (UUID).
    pub sid: String,
    /// Full HLS playlist URL, rewritten to the server origin.
    #[serde(rename = "hlsUrl")]
    pub hls_url: String,
    /// The channel this session belongs to.
    pub channel_id: String,
}

/// Per-household startup settings returned by GET /api/startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupConfig {
    pub default_deck_id: Option<String>,
    pub default_view_mode: ViewMode,
    pub allow_user_override: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Single,
    Multi,
}

/// A user-created deck of channels (legacy aggregated shape used by
/// existing code paths).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    pub id: String,
    pub name: String,
    /// Channels contained in this deck (may be empty if not populated server-side).
    #[serde(default)]
    pub entries: Vec<Channel>,
}

/// Single entry within a deck.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckEntry {
    pub channel_id: String,
    pub position: i32,
    pub in_commercial: bool,
}

/// A VOD (movie) listing item returned by GET /api/vod.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VodItem {
    pub stream_id: i64,
    pub name: String,
    pub stream_icon: Option<String>,
    pub rating: Option<String>,
    pub category_id: Option<String>,
    pub container_extension: Option<String>,
}

/// A series listing item returned by GET /api/series.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesItem {
    pub series_id: i64,
    pub name: String,
    pub cover: Option<String>,
    pub plot: Option<String>,
    pub genre: Option<String>,
    pub rating: Option<String>,
    pub category_id: Option<String>,
}

/// A user-defined custom list (playlist/parlay/dashboard).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserList {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub channel_count: u32,
}

/// A unified search result across channels, EPG programmes and VOD.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub channels: Vec<Channel>,
    pub programs: Vec<EpgEntry>,
    pub vod: Vec<VodItem>,
}

/// Per-user settings payload — minimal shape exposed to native clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub user_id: String,
    pub email: String,
    pub device_label: Option<String>,
    pub version: String,
}

/// Watch history entry returned by GET /api/history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchHistoryEntry {
    pub channel_id: String,
    pub started_at: String,
    pub media_type: String,
    pub vod_stream_id: Option<i64>,
}
