use crate::error::ApiError;
use crate::models::{
    Category, Channel, Deck, DeckEntry, EpgEntry, SearchResult, SeriesItem, StartupConfig,
    StreamSession, UserList, UserSettings, VodItem, VodStreamSession, WatchHistoryEntry,
};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Raw server response for POST /api/stream/<id> — channel_id is not included
/// in the server response; we inject it from the request parameter.
#[derive(Deserialize)]
struct StreamResponse {
    sid: String,
    #[serde(rename = "hlsUrl")]
    hls_url: String,
}

#[derive(Deserialize)]
struct QualityChangeResponse {
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
    decks: Vec<Value>,
}

#[derive(Deserialize)]
struct DeckResponse {
    deck: Value,
}

#[derive(Deserialize)]
struct VodStreamsResponse {
    streams: Vec<RawVodStream>,
}

#[derive(Deserialize)]
struct RawVodStream {
    stream_id: i64,
    name: String,
    #[serde(default)]
    stream_icon: Option<String>,
    #[serde(default)]
    rating: Option<String>,
    #[serde(default)]
    category_id: Option<String>,
    #[serde(default)]
    container_extension: Option<String>,
}

impl From<RawVodStream> for VodItem {
    fn from(r: RawVodStream) -> Self {
        VodItem {
            stream_id: r.stream_id,
            name: r.name,
            stream_icon: r.stream_icon,
            rating: r.rating,
            category_id: r.category_id,
            container_extension: r.container_extension,
        }
    }
}

#[derive(Deserialize)]
struct SeriesListResponse {
    series: Vec<RawSeries>,
}

#[derive(Deserialize)]
struct RawSeries {
    series_id: i64,
    name: String,
    #[serde(default)]
    cover: Option<String>,
    #[serde(default)]
    plot: Option<String>,
    #[serde(default)]
    genre: Option<String>,
    #[serde(default)]
    rating: Option<String>,
    #[serde(default)]
    category_id: Option<String>,
}

impl From<RawSeries> for SeriesItem {
    fn from(r: RawSeries) -> Self {
        SeriesItem {
            series_id: r.series_id,
            name: r.name,
            cover: r.cover,
            plot: r.plot,
            genre: r.genre,
            rating: r.rating,
            category_id: r.category_id,
        }
    }
}

#[derive(Deserialize)]
struct ListsResponse {
    lists: Vec<RawList>,
}

#[derive(Deserialize)]
struct RawList {
    id: String,
    name: String,
    kind: String,
    #[serde(default, rename = "channelCount")]
    channel_count: u32,
}

impl From<RawList> for UserList {
    fn from(r: RawList) -> Self {
        UserList {
            id: r.id,
            name: r.name,
            kind: r.kind,
            channel_count: r.channel_count,
        }
    }
}

#[derive(Deserialize)]
struct FavoritesResponse {
    favorites: Vec<String>,
}

#[derive(Deserialize)]
struct HistoryResponse {
    history: Vec<RawHistoryEntry>,
}

#[derive(Deserialize)]
struct RawHistoryEntry {
    #[serde(rename = "channelId")]
    channel_id: String,
    #[serde(rename = "startedAt")]
    started_at: String,
    #[serde(default, rename = "mediaType")]
    media_type: Option<String>,
    #[serde(default, rename = "vodStreamId")]
    vod_stream_id: Option<i64>,
}

impl From<RawHistoryEntry> for WatchHistoryEntry {
    fn from(r: RawHistoryEntry) -> Self {
        WatchHistoryEntry {
            channel_id: r.channel_id,
            started_at: r.started_at,
            media_type: r.media_type.unwrap_or_else(|| "live".to_string()),
            vod_stream_id: r.vod_stream_id,
        }
    }
}

#[derive(Deserialize)]
struct RawSearchResponse {
    #[serde(default)]
    channels: Vec<Channel>,
    #[serde(default)]
    programs: Vec<EpgEntry>,
    #[serde(default)]
    vod: Vec<RawVodStream>,
}

#[derive(serde::Serialize)]
struct StartStreamBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
}

#[derive(serde::Serialize)]
struct QualityChangeBody<'a> {
    sid: &'a str,
    quality: &'a str,
}

#[derive(serde::Serialize)]
struct ListChannelBody<'a> {
    #[serde(rename = "channelId")]
    channel_id: &'a str,
}

#[derive(serde::Serialize)]
struct FavoriteBody<'a> {
    #[serde(rename = "channelId")]
    channel_id: &'a str,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Cache TTL in seconds — matches the web's
/// `Cache-Control: private, max-age=30, stale-while-revalidate=300`.
const CACHE_TTL: Duration = Duration::from_secs(30);

/// In-memory TTL cache for list-oriented endpoints. These are the
/// expensive ones the FireStick Guide / Library screens hit on every
/// navigation and they barely change between calls.
#[derive(Default)]
struct ApiCache {
    channels: RwLock<Option<(Instant, Vec<Channel>)>>,
    categories: RwLock<Option<(Instant, Vec<Category>)>>,
    vod: RwLock<Option<(Instant, Vec<VodItem>)>>,
    series: RwLock<Option<(Instant, Vec<SeriesItem>)>>,
}

fn cache_get<T: Clone>(slot: &RwLock<Option<(Instant, T)>>) -> Option<T> {
    let guard = slot.read().ok()?;
    let (at, value) = guard.as_ref()?;
    if at.elapsed() < CACHE_TTL {
        Some(value.clone())
    } else {
        None
    }
}

fn cache_put<T>(slot: &RwLock<Option<(Instant, T)>>, value: T) {
    if let Ok(mut guard) = slot.write() {
        *guard = Some((Instant::now(), value));
    }
}

/// Thin HTTP client wrapping the Foundry IPTV Next.js API.
///
/// Construct with [`ApiClient::new`] then attach a token with
/// [`ApiClient::with_token`] (builder) or [`ApiClient::set_token`] (mutating)
/// before calling any authenticated method.
///
/// The underlying `reqwest::Client` is built **exactly once** at
/// construction time — swapping tokens does not rebuild it — so HTTPS
/// keepalive + TLS session tickets are reused across every FFI call.
pub struct ApiClient {
    pub base_url: String,
    token: RwLock<Option<String>>,
    http: reqwest::Client,
    cache: ApiCache,
}

impl ApiClient {
    /// Create a client pointed at `base_url`. Call [`with_token`](Self::with_token)
    /// or [`set_token`](Self::set_token) before making authenticated requests.
    pub fn new(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .use_rustls_tls()
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(8)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            token: RwLock::new(None),
            http,
            cache: ApiCache::default(),
        }
    }

    /// Attach a device bearer token (builder pattern).
    pub fn with_token(self, token: impl Into<String>) -> Self {
        if let Ok(mut guard) = self.token.write() {
            *guard = Some(token.into());
        }
        self
    }

    /// Mutate the stored bearer token in place — no rebuild of the
    /// underlying `reqwest::Client`.
    pub fn set_token(&self, token: impl Into<String>) {
        if let Ok(mut guard) = self.token.write() {
            *guard = Some(token.into());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    fn authed(&self, req: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder, ApiError> {
        let guard = self
            .token
            .read()
            .map_err(|_| ApiError::Other("token lock poisoned".to_string()))?;
        match guard.as_ref() {
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
        self.token.read().ok().and_then(|g| g.clone())
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
    /// The unfiltered (category=None) path is cached for 30 seconds.
    pub async fn list_channels(&self, category: Option<&str>) -> Result<Vec<Channel>, ApiError> {
        if category.is_none() {
            if let Some(cached) = cache_get(&self.cache.channels) {
                return Ok(cached);
            }
        }
        let mut req = self.authed(self.http.get(self.url("/api/channels")))?;
        if let Some(cat) = category {
            req = req.query(&[("category", cat)]);
        }
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: ChannelsResponse = resp.json().await?;
        if category.is_none() {
            cache_put(&self.cache.channels, body.channels.clone());
        }
        Ok(body.channels)
    }

    /// `GET /api/channels/categories` — list categories.
    ///
    /// W5-D changed the server shape from `string[]` to
    /// `{ categories: [{ name, count }] }`. We accept both shapes for
    /// forward + backward compat and cache the result for 30 seconds.
    pub async fn list_categories(&self) -> Result<Vec<Category>, ApiError> {
        if let Some(cached) = cache_get(&self.cache.categories) {
            return Ok(cached);
        }
        let req = self.authed(self.http.get(self.url("/api/channels/categories")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: Value = resp.json().await?;

        let entries: Vec<Category> = match body {
            // Legacy: ["Sports", "News", ...]
            Value::Array(arr) => arr
                .into_iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .map(|n| Category {
                    id: n.clone(),
                    name: n,
                    channel_count: 0,
                })
                .collect(),
            // W5-D: { categories: [{name, count}] } — also accepts legacy
            // { categories: ["name", ...] } for safety.
            Value::Object(ref map) => {
                if let Some(Value::Array(arr)) = map.get("categories") {
                    arr.iter()
                        .filter_map(|v| {
                            if let Some(s) = v.as_str() {
                                Some(Category {
                                    id: s.to_string(),
                                    name: s.to_string(),
                                    channel_count: 0,
                                })
                            } else if let Some(obj) = v.as_object() {
                                let name = obj
                                    .get("name")
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if name.is_empty() {
                                    return None;
                                }
                                let count = obj
                                    .get("count")
                                    .and_then(|x| x.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                Some(Category {
                                    id: name.clone(),
                                    name,
                                    channel_count: count,
                                })
                            } else {
                                None
                            }
                        })
                        .collect()
                } else {
                    vec![]
                }
            }
            _ => vec![],
        };
        cache_put(&self.cache.categories, entries.clone());
        Ok(entries)
    }

    /// `GET /api/epg/<channelId>` — get EPG programme list for a channel.
    /// `hours` is accepted for forward-compat; the server currently returns
    /// the full window it has cached.
    pub async fn get_epg(
        &self,
        channel_id: &str,
        _hours: Option<u32>,
    ) -> Result<Vec<EpgEntry>, ApiError> {
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
        let req = self.authed(self.http.delete(url))?.query(&[("sid", sid)]);
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

    /// `PATCH /api/stream/<channelId>` — hot-swap quality on an existing session.
    /// The channel_id is not actually used by the server for PATCH but the
    /// route still requires it; we pass a placeholder.
    pub async fn change_quality(
        &self,
        sid: &str,
        quality: &str,
    ) -> Result<String, ApiError> {
        // Channel id is unused server-side for PATCH but required in the URL.
        let url = self.url("/api/stream/_");
        let req = self
            .authed(self.http.patch(url))?
            .json(&QualityChangeBody { sid, quality });
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let raw: QualityChangeResponse = resp.json().await?;
        Ok(raw.hls_url)
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
        Ok(body.decks.into_iter().map(deck_from_value).collect())
    }

    /// `GET /api/decks/<id>` — single deck with entries.
    pub async fn get_deck(&self, deck_id: &str) -> Result<Deck, ApiError> {
        let url = self.url(&format!("/api/decks/{}", deck_id));
        let req = self.authed(self.http.get(url))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: DeckResponse = resp.json().await?;
        Ok(deck_from_value(body.deck))
    }

    /// Start a stream for a specific deck entry. Implemented client-side by
    /// looking up the deck, resolving the entry's channel id, and starting a
    /// normal stream. `entry_index` is 0-based.
    pub async fn start_deck_stream(
        &self,
        deck_id: &str,
        entry_index: u32,
        quality: Option<&str>,
    ) -> Result<StreamSession, ApiError> {
        let deck = self.get_deck(deck_id).await?;
        let idx = entry_index as usize;
        let channel_id = deck
            .entries
            .get(idx)
            .map(|e| e.channel_id.clone())
            .ok_or_else(|| ApiError::Other(format!("deck entry {} not found", entry_index)))?;
        self.start_stream(&channel_id, quality).await
    }

    // -----------------------------------------------------------------------
    // VOD / Series
    // -----------------------------------------------------------------------

    /// `GET /api/vod?category=<cat>` — unfiltered list is cached 30s.
    pub async fn list_vod(&self, category: Option<&str>) -> Result<Vec<VodItem>, ApiError> {
        if category.is_none() {
            if let Some(cached) = cache_get(&self.cache.vod) {
                return Ok(cached);
            }
        }
        let mut req = self.authed(self.http.get(self.url("/api/vod")))?;
        if let Some(cat) = category {
            req = req.query(&[("category", cat)]);
        }
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: VodStreamsResponse = resp.json().await?;
        let items: Vec<VodItem> = body.streams.into_iter().map(VodItem::from).collect();
        if category.is_none() {
            cache_put(&self.cache.vod, items.clone());
        }
        Ok(items)
    }

    /// `GET /api/vod/<id>` — returns the raw VodInfo JSON as a string. The
    /// server shape is deeply nested and unstable; native clients can parse it
    /// with kotlinx.serialization if needed.
    pub async fn get_vod_detail(&self, vod_id: &str) -> Result<String, ApiError> {
        let url = self.url(&format!("/api/vod/{}", vod_id));
        let req = self.authed(self.http.get(url))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.text().await?)
    }

    /// `GET /api/series?category=<cat>` — unfiltered list is cached 30s.
    pub async fn list_series(&self, category: Option<&str>) -> Result<Vec<SeriesItem>, ApiError> {
        if category.is_none() {
            if let Some(cached) = cache_get(&self.cache.series) {
                return Ok(cached);
            }
        }
        let mut req = self.authed(self.http.get(self.url("/api/series")))?;
        if let Some(cat) = category {
            req = req.query(&[("category", cat)]);
        }
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: SeriesListResponse = resp.json().await?;
        let items: Vec<SeriesItem> = body.series.into_iter().map(SeriesItem::from).collect();
        if category.is_none() {
            cache_put(&self.cache.series, items.clone());
        }
        Ok(items)
    }

    /// `GET /api/series/<id>` — returns the raw SeriesInfo JSON as a string.
    pub async fn get_series_detail(&self, series_id: &str) -> Result<String, ApiError> {
        let url = self.url(&format!("/api/series/{}", series_id));
        let req = self.authed(self.http.get(url))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        Ok(resp.text().await?)
    }

    // -----------------------------------------------------------------------
    // Lists / favorites
    // -----------------------------------------------------------------------

    /// `GET /api/lists`
    pub async fn list_lists(&self) -> Result<Vec<UserList>, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/lists")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: ListsResponse = resp.json().await?;
        Ok(body.lists.into_iter().map(UserList::from).collect())
    }

    /// `GET /api/lists/<listId>` — returns channels in a list. The server
    /// exposes a sub-route that returns a `{channels: Channel[]}` envelope.
    pub async fn list_list_channels(&self, list_id: &str) -> Result<Vec<Channel>, ApiError> {
        let url = self.url(&format!("/api/lists/{}", list_id));
        let req = self.authed(self.http.get(url))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: ChannelsResponse = resp.json().await?;
        Ok(body.channels)
    }

    /// `POST /api/lists/<listId>/channels` — add a channel to a list.
    pub async fn add_to_list(&self, list_id: &str, channel_id: &str) -> Result<(), ApiError> {
        let url = self.url(&format!("/api/lists/{}/channels", list_id));
        let req = self
            .authed(self.http.post(url))?
            .json(&ListChannelBody { channel_id });
        let resp = req.send().await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// `GET /api/favorites`
    pub async fn list_favorites(&self) -> Result<Vec<String>, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/favorites")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: FavoritesResponse = resp.json().await?;
        Ok(body.favorites)
    }

    /// Toggle: POST if not favorited, DELETE if favorited. Returns the new
    /// favorited state.
    pub async fn toggle_favorite(&self, channel_id: &str) -> Result<bool, ApiError> {
        let existing = self.list_favorites().await?;
        let currently_fav = existing.iter().any(|id| id == channel_id);
        if currently_fav {
            let req = self
                .authed(self.http.delete(self.url("/api/favorites")))?
                .json(&FavoriteBody { channel_id });
            let resp = req.send().await?;
            let status = resp.status();
            if !(status.is_success() || status == reqwest::StatusCode::NO_CONTENT) {
                let body = resp.text().await.unwrap_or_default();
                return Err(ApiError::Server {
                    status: status.as_u16(),
                    body,
                });
            }
            Ok(false)
        } else {
            let req = self
                .authed(self.http.post(self.url("/api/favorites")))?
                .json(&FavoriteBody { channel_id });
            let resp = req.send().await?;
            Self::check(resp).await?;
            Ok(true)
        }
    }

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

    /// `GET /api/search?q=<q>`
    pub async fn search(&self, query: &str) -> Result<SearchResult, ApiError> {
        let req = self
            .authed(self.http.get(self.url("/api/search")))?
            .query(&[("q", query)]);
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: RawSearchResponse = resp.json().await?;
        Ok(SearchResult {
            channels: body.channels,
            programs: body.programs,
            vod: body.vod.into_iter().map(VodItem::from).collect(),
        })
    }

    /// `GET /api/search/ai?q=<q>`
    pub async fn ai_search(&self, query: &str) -> Result<SearchResult, ApiError> {
        let req = self
            .authed(self.http.get(self.url("/api/search/ai")))?
            .query(&[("q", query)]);
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: RawSearchResponse = resp.json().await?;
        Ok(SearchResult {
            channels: body.channels,
            programs: body.programs,
            vod: body.vod.into_iter().map(VodItem::from).collect(),
        })
    }

    // -----------------------------------------------------------------------
    // Settings + history
    // -----------------------------------------------------------------------

    /// Best-effort user settings: the web app has no single `/api/settings`
    /// endpoint — it composes session + household + version. We synthesize a
    /// [`UserSettings`] from `/api/startup` + CARGO_PKG_VERSION + a SHA-256
    /// digest of the stored token so native clients can at least render a
    /// non-reversible device identifier.
    pub async fn get_settings(&self) -> Result<UserSettings, ApiError> {
        let startup = self.get_startup().await.ok();
        let token_id = self
            .token
            .read()
            .ok()
            .and_then(|g| g.clone())
            .map(|t| {
                let mut h = Sha256::new();
                h.update(t.as_bytes());
                let digest = h.finalize();
                hex::encode(digest).chars().take(8).collect::<String>()
            })
            .unwrap_or_default();
        Ok(UserSettings {
            user_id: String::new(),
            email: String::new(),
            device_label: startup.and_then(|s| s.default_deck_id),
            version: env!("CARGO_PKG_VERSION").to_string(),
            token_id,
            platform: "android-fire-tv".to_string(),
        })
    }

    /// `GET /api/history`
    pub async fn list_watch_history(&self) -> Result<Vec<WatchHistoryEntry>, ApiError> {
        let req = self.authed(self.http.get(self.url("/api/history")))?;
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        let body: HistoryResponse = resp.json().await?;
        Ok(body.history.into_iter().map(WatchHistoryEntry::from).collect())
    }

    /// `POST /api/history` — record a watch event. Mirrors the web's
    /// fire-and-forget pattern; errors are returned but callers generally
    /// drop them.
    ///
    /// * `media_type` — "live" | "vod" | "series"
    /// * `id` — channel_id for live, stream_id for VOD, series_id for series
    pub async fn record_watch_history(
        &self,
        media_type: &str,
        id: &str,
    ) -> Result<(), ApiError> {
        let body = match media_type {
            "vod" | "series" => {
                let stream_id: i64 = id.parse().map_err(|_| {
                    ApiError::Other(format!("record_watch_history: '{}' not numeric", id))
                })?;
                serde_json::json!({
                    "channelId": format!("{}:{}", media_type, stream_id),
                    "mediaType": media_type,
                    "vodStreamId": stream_id,
                })
            }
            _ => serde_json::json!({ "channelId": id, "mediaType": "live" }),
        };
        let req = self
            .authed(self.http.post(self.url("/api/history")))?
            .json(&body);
        let resp = req.send().await?;
        Self::check(resp).await?;
        Ok(())
    }

    /// `POST /api/stream/vod/<streamId>` — start a ts2hls session for a
    /// VOD movie. Returns an HLS URL even though the underlying container
    /// is progressive (ts2hls wraps it).
    pub async fn start_vod_stream(
        &self,
        stream_id: &str,
        ext: Option<&str>,
    ) -> Result<VodStreamSession, ApiError> {
        self.start_vod_like(stream_id, "movie", ext).await
    }

    /// `POST /api/stream/vod/<episodeId>` with `type: "series"` — start a
    /// ts2hls session for a series episode. `episode_id` is the Xtream
    /// episode stream id.
    pub async fn start_episode_stream(
        &self,
        episode_id: &str,
        ext: Option<&str>,
    ) -> Result<VodStreamSession, ApiError> {
        self.start_vod_like(episode_id, "series", ext).await
    }

    async fn start_vod_like(
        &self,
        id: &str,
        kind: &str,
        ext: Option<&str>,
    ) -> Result<VodStreamSession, ApiError> {
        let url = self.url(&format!("/api/stream/vod/{}", id));
        let body = serde_json::json!({
            "type": kind,
            "ext": ext.unwrap_or("mp4"),
        });
        let req = self.authed(self.http.post(url))?.json(&body);
        let resp = req.send().await?;
        let resp = Self::check(resp).await?;
        #[derive(Deserialize)]
        struct VodStreamResponse {
            sid: String,
            #[serde(rename = "hlsUrl")]
            hls_url: String,
        }
        let raw: VodStreamResponse = resp.json().await?;
        Ok(VodStreamSession {
            sid: raw.sid,
            url: raw.hls_url,
            // Server always returns ts2hls-wrapped HLS even for
            // "progressive" sources; client should use StreamKind.HLS.
            kind: "hls".to_string(),
        })
    }

    /// Parallel fan-out over `GET /api/epg/<id>` — the Guide screen uses
    /// this to fetch EPG for every visible channel without 200 sequential
    /// round-trips. Concurrency is bounded to 16 in-flight requests via
    /// `tokio::task::JoinSet` so a slow upstream can't starve the worker
    /// pool.
    pub async fn get_epg_batch(
        &self,
        channel_ids: &[String],
        hours: Option<u32>,
    ) -> Result<Vec<(String, Vec<EpgEntry>)>, ApiError> {
        use std::sync::Arc;
        use tokio::sync::Semaphore;
        use tokio::task::JoinSet;

        let semaphore = Arc::new(Semaphore::new(16));
        let mut set: JoinSet<(String, Result<Vec<EpgEntry>, ApiError>)> = JoinSet::new();

        let token = self.token_for_cleanup();
        let base = self.base_url.clone();
        let http = self.http.clone();

        for cid in channel_ids {
            let cid = cid.clone();
            let sem = semaphore.clone();
            let token = token.clone();
            let base = base.clone();
            let http = http.clone();
            let _hours = hours;
            set.spawn(async move {
                let _permit = match sem.acquire_owned().await {
                    Ok(p) => p,
                    Err(_) => {
                        return (
                            cid,
                            Err(ApiError::Other("semaphore closed".to_string())),
                        );
                    }
                };
                let url = format!("{}/api/epg/{}", base, cid);
                let mut req = http.get(&url);
                if let Some(t) = &token {
                    req = req.bearer_auth(t);
                } else {
                    return (cid, Err(ApiError::Unauthenticated));
                }
                let res = async {
                    let resp = req.send().await?;
                    let resp = Self::check(resp).await?;
                    let body: EpgResponse = resp.json().await?;
                    Ok::<_, ApiError>(body.programs)
                }
                .await;
                (cid, res)
            });
        }

        let mut out = Vec::with_capacity(channel_ids.len());
        while let Some(joined) = set.join_next().await {
            match joined {
                Ok((cid, Ok(programs))) => out.push((cid, programs)),
                Ok((cid, Err(e))) => {
                    log::warn!("get_epg_batch[{}] failed: {:?}", cid, e);
                    // On failure, return empty list for this channel so
                    // the caller can still render everything else.
                    out.push((cid, Vec::new()));
                }
                Err(join_err) => {
                    return Err(ApiError::Other(format!("join error: {}", join_err)));
                }
            }
        }
        Ok(out)
    }
}


// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/// Convert the server's deck JSON (which has varying shapes depending on
/// whether it's from `/api/decks` list vs `/api/decks/<id>` detail) into our
/// simplified [`Deck`] model. Robust to missing fields.
///
/// W5-D: each entry now carries a full `channel: Channel | null` object
/// alongside `channelId`, so we populate [`DeckEntry::channel`] when present.
fn deck_from_value(v: Value) -> Deck {
    let id = v
        .get("id")
        .map(|x| match x {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            _ => String::new(),
        })
        .unwrap_or_default();
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let entries = v
        .get("entries")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, e)| {
                    let channel_id = e
                        .get("channelId")
                        .or_else(|| e.get("channel_id"))
                        .or_else(|| e.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let position = e
                        .get("position")
                        .and_then(|v| v.as_i64())
                        .map(|n| n as i32)
                        .unwrap_or(i as i32);
                    let in_commercial = e
                        .get("inCommercial")
                        .or_else(|| e.get("in_commercial"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let channel = e
                        .get("channel")
                        .and_then(|c| {
                            if c.is_null() {
                                None
                            } else {
                                serde_json::from_value::<Channel>(c.clone()).ok()
                            }
                        });
                    DeckEntry {
                        channel_id,
                        position,
                        in_commercial,
                        channel,
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Deck { id, name, entries }
}
