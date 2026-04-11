use crate::auth::DeviceAuth;
use crate::error::ApiError;
use crate::stream::{StreamQuality, StreamSession};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpgEntry {
    pub channel_id: String,
    pub start_at: chrono::DateTime<chrono::Utc>,
    pub end_at: chrono::DateTime<chrono::Utc>,
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupConfig {
    pub server_version: String,
    pub default_quality: StreamQuality,
    pub epg_refresh_interval_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    pub id: String,
    pub name: String,
    pub channel_ids: Vec<String>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Thin HTTP client wrapping the Foundry IPTV Next.js API.
/// Authenticated via a device bearer token from `DeviceAuth`.
pub struct ApiClient {
    pub base_url: String,
    auth: Option<DeviceAuth>,
    http: reqwest::Client,
}

impl ApiClient {
    /// Create a client pointed at `base_url`. Call `set_auth` before making
    /// authenticated requests.
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            auth: None,
            http: reqwest::Client::new(),
        }
    }

    /// Attach device credentials.
    pub fn with_auth(mut self, auth: DeviceAuth) -> Self {
        self.auth = Some(auth);
        self
    }

    fn authed(&self, req: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder, ApiError> {
        match &self.auth {
            Some(a) => Ok(a.authorize_request(req)),
            None => Err(ApiError::Unauthenticated),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    // -----------------------------------------------------------------------
    // API methods (stubs — real impl in follow-up wave)
    // -----------------------------------------------------------------------

    pub async fn list_channels(&self) -> Result<Vec<Channel>, ApiError> {
        let _req = self.authed(self.http.get(self.url("/api/channels")))?;
        // TODO: send request, deserialise JSON array
        todo!("implement list_channels")
    }

    pub async fn get_epg(&self, _channel_id: &str) -> Result<Vec<EpgEntry>, ApiError> {
        // TODO: GET /api/epg?channel=<id>
        todo!("implement get_epg")
    }

    pub async fn start_stream(
        &self,
        _channel_id: &str,
        _quality: StreamQuality,
    ) -> Result<StreamSession, ApiError> {
        // TODO: POST /api/stream/start
        todo!("implement start_stream")
    }

    pub async fn stop_stream(&self, _session_id: &str) -> Result<(), ApiError> {
        // TODO: DELETE /api/stream/<session_id>
        todo!("implement stop_stream")
    }

    pub async fn get_startup(&self) -> Result<StartupConfig, ApiError> {
        // TODO: GET /api/startup
        todo!("implement get_startup")
    }

    pub async fn get_decks(&self) -> Result<Vec<Deck>, ApiError> {
        // TODO: GET /api/decks
        todo!("implement get_decks")
    }
}
