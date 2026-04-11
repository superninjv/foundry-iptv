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

/// A user-created deck of channels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    pub id: String,
    pub name: String,
    /// Channels contained in this deck (may be empty if not populated server-side).
    #[serde(default)]
    pub entries: Vec<Channel>,
}
