use serde::{Deserialize, Serialize};

/// Quality preset sent to the server when requesting a stream session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamQuality {
    Auto,
    High,
    Medium,
    Low,
}

impl Default for StreamQuality {
    fn default() -> Self {
        Self::Auto
    }
}

/// A live HLS stream session returned by the server.
/// Real playback is handled by the platform shell (GStreamer or ExoPlayer).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamSession {
    pub id: String,
    pub hls_url: String,
    pub channel_id: String,
    pub quality: StreamQuality,
}
