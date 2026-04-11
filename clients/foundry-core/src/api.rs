use crate::error::ApiError;
use crate::models::{Channel, Deck, EpgEntry, StartupConfig, StreamSession};
use serde::Deserialize;

/// Raw server response for POST /api/stream/<id> — channel_id is not included
/// in the server response; we inject it from the request parameter.
#[derive(Deserialize)]
struct StreamResponse {
    sid: String,
    #[serde(rename = "hlsUrl")]
    hls_url: String,
}

// ---------------------------------------------------------------------------
// Response wrappers that match the Next.js JSON envelopes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ChannelsResponse {
    channels: Vec<Channel>,
}

#[derive(Deserialize)]
struct EpgResponse {
    programs: Vec<EpgEntry>,
}

#[derive(Deserialize)]
struct DecksResponse {
    decks: Vec<Deck>,
}

#[derive(serde::Serialize)]
struct StartStreamBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Thin HTTP client wrapping the Foundry IPTV Next.js API.
///
/// Construct with [`ApiClient::new`] then attach a token with
/// [`ApiClient::with_token`] before calling any authenticated method.
pub struct ApiClient {
    pub base_url: String,
    token: Option<String>,
    http: reqwest::Client,
}

impl ApiClient {
    /// Create a client pointed at `base_url`. Call [`with_token`](Self::with_token)
    /// before making authenticated requests.
    pub fn new(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .use_rustls_tls()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            token: None,
            http,
        }
    }

    /// Attach a device bearer token (builder pattern).
    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    fn authed(&self, req: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder, ApiError> {
        match &self.token {
            Some(t) => Ok(req.bearer_auth(t)),
            None => Err(ApiError::Unauthenticated),
        }
    }

    async fn check(resp: reqwest::Response) -> Result<reqwest::Response, ApiError> {
        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(ApiError::Unauthenticated);
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ApiError::Server {
                status: status.as_u16(),
                body,
            });
        }
        Ok(resp)
    }

    /// Returns a clone of the stored token, if any. Used by [`StreamController`]
    /// for best-effort cleanup in `Drop`.
    pub fn token_for_cleanup(&self) -> Option<String> {
        self.token.clone()
    }

    // -----------------------------------------------------------------------
    // Unauthenticated
    // -----------------------------------------------------------------------

    /// `GET /api/health` — unauthenticated liveness probe.
    pub async fn health(&self) -> Result<serde_json::Value, ApiError> {
        let resp = self.http.get(self.url("/api/health")).send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    // -----------------------------------------------------------------------
    // Authenticated API methods
    // -----------------------------------------------------------------------

    /// `GET /api/channels?category=<cat>` — list channels, optionally filtered.
    pub async fn list_channels(&self, category: Option<&str>) -> Result<Vec<Channel>, ApiError> {
        let mut req = self.authed(self.http.get(self.url("/api/channels")))?;
        if let Some(cat) = category {
            req = req.query(&[("category", cat)]);
        }
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: ChannelsResponse = resp.json().await?;
        Ok(body.channels)
    }

    /// `GET /api/channels/categories` — list category names.
    pub async fn list_categories(&self) -> Result<Vec<String>, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/channels/categories")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// `GET /api/epg/<channelId>` — get EPG programme list for a channel.
    pub async fn get_epg(&self, channel_id: &str) -> Result<Vec<EpgEntry>, ApiError> {
        let url = self.url(&format!("/api/epg/{}", channel_id));
        let req = self.authed(self.http.get(url))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: EpgResponse = resp.json().await?;
        Ok(body.programs)
    }

    /// `POST /api/stream/<channelId>` — start an HLS stream session.
    pub async fn start_stream(
        &self,
        channel_id: &str,
        quality: Option<&str>,
    ) -> Result<StreamSession, ApiError> {
        let url = self.url(&format!("/api/stream/{}", channel_id));
        let req = self
            .authed(self.http.post(url))?
            .json(&StartStreamBody { quality });
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        // Server response doesn't include channel_id — inject from request param.
        let raw: StreamResponse = resp.json().await?;
        Ok(StreamSession {
            sid: raw.sid,
            hls_url: raw.hls_url,
            channel_id: channel_id.to_string(),
        })
    }

    /// `DELETE /api/stream/<channelId>?sid=<sid>` — stop a stream session.
    pub async fn stop_stream(&self, channel_id: &str, sid: &str) -> Result<(), ApiError> {
        let url = self.url(&format!("/api/stream/{}", channel_id));
        let req = self
            .authed(self.http.delete(url))?
            .query(&[("sid", sid)]);
        let resp = req.send().await?;
        let status = resp.status();
        if status == reqwest::StatusCode::NO_CONTENT || status.is_success() {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        Err(ApiError::Server {
            status: status.as_u16(),
            body,
        })
    }

    /// `GET /api/startup` — household startup settings.
    pub async fn get_startup(&self) -> Result<StartupConfig, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/startup")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.json().await?)
    }

    /// `GET /api/decks` — user's decks.
    pub async fn get_decks(&self) -> Result<Vec<Deck>, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/decks")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: DecksResponse = resp.json().await?;
        Ok(body.decks)
    }
}
