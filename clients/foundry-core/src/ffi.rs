//! FFI layer — uniffi-compatible wrappers around the async ApiClient.
//!
//! The real client in `api.rs` is fully async and uses `&str`, `Option<&str>`,
//! and struct-variant errors — none of which fit uniffi's requirements. This
//! module keeps the real client untouched and exposes a thin blocking façade
//! with exactly the surface declared in `foundry-core.udl`.
//!
//! Blocking is implemented via a shared Tokio runtime owned by the FFI
//! `ApiClient`. Callers should invoke these methods from a background thread
//! (Kotlin: `withContext(Dispatchers.IO)`) — they'll block the caller's
//! thread while the request is in flight.

#![cfg(feature = "uniffi")]

use std::sync::{Arc, Once};
use tokio::runtime::Runtime;

use crate::api as real_api;
use crate::auth as real_auth;
use crate::models as real_models;

static LOGGER_INIT: Once = Once::new();

/// Initialize android_logger exactly once. Safe to call from any FFI entry.
fn init_logger() {
    LOGGER_INIT.call_once(|| {
        #[cfg(target_os = "android")]
        {
            android_logger::init_once(
                android_logger::Config::default()
                    .with_max_level(log::LevelFilter::Debug)
                    .with_tag("foundry_core"),
            );
        }
        log::info!("foundry_core logger initialized");
    });
}

// ---------------------------------------------------------------------------
// Error types exposed to Kotlin (flat variants matching the UDL).
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Unauthenticated — call set_token() first")]
    Unauthenticated,
    #[error("Network error: {msg}")]
    Network { msg: String },
    #[error("Server returned {status}: {body}")]
    Server { status: u16, body: String },
    #[error("JSON parse error: {msg}")]
    Json { msg: String },
    #[error("{msg}")]
    Other { msg: String },
}

impl From<crate::error::ApiError> for ApiError {
    fn from(e: crate::error::ApiError) -> Self {
        match e {
            crate::error::ApiError::Unauthenticated => ApiError::Unauthenticated,
            crate::error::ApiError::Http(err) => ApiError::Network {
                msg: err.to_string(),
            },
            crate::error::ApiError::Json(err) => ApiError::Json {
                msg: err.to_string(),
            },
            crate::error::ApiError::Server { status, body } => ApiError::Server { status, body },
            crate::error::ApiError::Db(err) => ApiError::Other {
                msg: err.to_string(),
            },
            crate::error::ApiError::Other(msg) => ApiError::Other { msg },
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Network error: {msg}")]
    Network { msg: String },
    #[error("Server rejected pairing (status {status}): {body}")]
    Rejected { status: u16, body: String },
    #[error("Parse error: {msg}")]
    Parse { msg: String },
}

impl From<crate::error::AuthError> for AuthError {
    fn from(e: crate::error::AuthError) -> Self {
        match e {
            crate::error::AuthError::Http(err) => AuthError::Network {
                msg: err.to_string(),
            },
            crate::error::AuthError::Rejected { status, body } => {
                AuthError::Rejected { status, body }
            }
            crate::error::AuthError::Parse(msg) => AuthError::Parse { msg },
        }
    }
}

// ---------------------------------------------------------------------------
// Plain data types matching the UDL dictionaries.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub group: Option<String>,
    pub logo_url: Option<String>,
    pub tvg_id: Option<String>,
}

impl From<real_models::Channel> for Channel {
    fn from(c: real_models::Channel) -> Self {
        Channel {
            id: c.id,
            name: c.name,
            group: c.group,
            logo_url: c.logo_url,
            tvg_id: c.tvg_id,
        }
    }
}

#[derive(Debug, Clone)]
pub struct StreamSession {
    pub sid: String,
    pub hls_url: String,
    pub channel_id: String,
}

impl From<real_models::StreamSession> for StreamSession {
    fn from(s: real_models::StreamSession) -> Self {
        StreamSession {
            sid: s.sid,
            hls_url: s.hls_url,
            channel_id: s.channel_id,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub channel_count: u32,
}

impl From<real_models::Category> for Category {
    fn from(c: real_models::Category) -> Self {
        Category {
            id: c.id,
            name: c.name,
            channel_count: c.channel_count,
        }
    }
}

#[derive(Debug, Clone)]
pub struct EpgEntry {
    pub channel_id: String,
    /// RFC3339 start time
    pub start: String,
    /// RFC3339 end time
    pub end: String,
    pub title: String,
    pub description: Option<String>,
}

impl From<real_models::EpgEntry> for EpgEntry {
    fn from(e: real_models::EpgEntry) -> Self {
        EpgEntry {
            channel_id: e.channel_id,
            start: e.start.to_rfc3339(),
            end: e.end.to_rfc3339(),
            title: e.title,
            description: e.description,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VodItem {
    pub stream_id: i64,
    pub name: String,
    pub stream_icon: Option<String>,
    pub rating: Option<String>,
    pub category_id: Option<String>,
    pub container_extension: Option<String>,
}

impl From<real_models::VodItem> for VodItem {
    fn from(v: real_models::VodItem) -> Self {
        VodItem {
            stream_id: v.stream_id,
            name: v.name,
            stream_icon: v.stream_icon,
            rating: v.rating,
            category_id: v.category_id,
            container_extension: v.container_extension,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SeriesItem {
    pub series_id: i64,
    pub name: String,
    pub cover: Option<String>,
    pub plot: Option<String>,
    pub genre: Option<String>,
    pub rating: Option<String>,
    pub category_id: Option<String>,
}

impl From<real_models::SeriesItem> for SeriesItem {
    fn from(s: real_models::SeriesItem) -> Self {
        SeriesItem {
            series_id: s.series_id,
            name: s.name,
            cover: s.cover,
            plot: s.plot,
            genre: s.genre,
            rating: s.rating,
            category_id: s.category_id,
        }
    }
}

#[derive(Debug, Clone)]
pub struct DeckEntry {
    pub channel_id: String,
    pub position: i32,
    pub in_commercial: bool,
    /// Full channel object if the server populated it. W5-D+.
    pub channel: Option<Channel>,
}

#[derive(Debug, Clone)]
pub struct Deck {
    pub id: String,
    pub name: String,
    pub entries: Vec<DeckEntry>,
}

impl From<real_models::Deck> for Deck {
    fn from(d: real_models::Deck) -> Self {
        let entries = d
            .entries
            .into_iter()
            .map(|e| DeckEntry {
                channel_id: e.channel_id,
                position: e.position,
                in_commercial: e.in_commercial,
                channel: e.channel.map(Channel::from),
            })
            .collect();
        Deck {
            id: d.id,
            name: d.name,
            entries,
        }
    }
}

#[derive(Debug, Clone)]
pub struct UserList {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub channel_count: u32,
}

impl From<real_models::UserList> for UserList {
    fn from(l: real_models::UserList) -> Self {
        UserList {
            id: l.id,
            name: l.name,
            kind: l.kind,
            channel_count: l.channel_count,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub channels: Vec<Channel>,
    pub programs: Vec<EpgEntry>,
    pub vod: Vec<VodItem>,
}

impl From<real_models::SearchResult> for SearchResult {
    fn from(s: real_models::SearchResult) -> Self {
        SearchResult {
            channels: s.channels.into_iter().map(Channel::from).collect(),
            programs: s.programs.into_iter().map(EpgEntry::from).collect(),
            vod: s.vod.into_iter().map(VodItem::from).collect(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct StartupConfig {
    pub default_deck_id: Option<String>,
    pub default_view_mode: String,
    pub allow_user_override: bool,
}

impl From<real_models::StartupConfig> for StartupConfig {
    fn from(c: real_models::StartupConfig) -> Self {
        let view_mode = match c.default_view_mode {
            real_models::ViewMode::Single => "single".to_string(),
            real_models::ViewMode::Multi => "multi".to_string(),
        };
        StartupConfig {
            default_deck_id: c.default_deck_id,
            default_view_mode: view_mode,
            allow_user_override: c.allow_user_override,
        }
    }
}

#[derive(Debug, Clone)]
pub struct UserSettings {
    pub user_id: String,
    pub email: String,
    pub device_label: Option<String>,
    pub version: String,
    pub token_id: String,
    pub platform: String,
}

impl From<real_models::UserSettings> for UserSettings {
    fn from(s: real_models::UserSettings) -> Self {
        UserSettings {
            user_id: s.user_id,
            email: s.email,
            device_label: s.device_label,
            version: s.version,
            token_id: s.token_id,
            platform: s.platform,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VodStreamSession {
    pub sid: String,
    pub url: String,
    /// One of `"hls"` or `"progressive"`.
    pub kind: String,
}

impl From<real_models::VodStreamSession> for VodStreamSession {
    fn from(v: real_models::VodStreamSession) -> Self {
        VodStreamSession {
            sid: v.sid,
            url: v.url,
            kind: v.kind,
        }
    }
}

#[derive(Debug, Clone)]
pub struct EpgBatchEntry {
    pub channel_id: String,
    pub programs: Vec<EpgEntry>,
}

#[derive(Debug, Clone, Copy)]
pub enum MediaType {
    Live,
    Vod,
    Series,
}

impl MediaType {
    fn as_str(self) -> &'static str {
        match self {
            MediaType::Live => "live",
            MediaType::Vod => "vod",
            MediaType::Series => "series",
        }
    }
}

#[derive(Debug, Clone)]
pub struct WatchHistoryEntry {
    pub channel_id: String,
    pub started_at: String,
    pub media_type: String,
    pub vod_stream_id: Option<i64>,
}

impl From<real_models::WatchHistoryEntry> for WatchHistoryEntry {
    fn from(h: real_models::WatchHistoryEntry) -> Self {
        WatchHistoryEntry {
            channel_id: h.channel_id,
            started_at: h.started_at,
            media_type: h.media_type,
            vod_stream_id: h.vod_stream_id,
        }
    }
}

// ---------------------------------------------------------------------------
// ApiClient — blocking façade around the async client.
// ---------------------------------------------------------------------------

pub struct ApiClient {
    /// Single owned real client — holds ONE `reqwest::Client` for the
    /// lifetime of this wrapper. HTTPS keepalive / TLS session tickets
    /// are reused across every FFI call.
    inner: Arc<real_api::ApiClient>,
    rt: Arc<Runtime>,
}

impl ApiClient {
    /// Constructor called from Kotlin as `ApiClient("http://host")`.
    /// uniffi wraps the returned value in `Arc` for us.
    pub fn new(base_url: String) -> Self {
        init_logger();
        log::info!("ApiClient::new base_url={}", base_url);
        // 4 worker threads — enough for the FireStick's weak SoC while
        // still letting Compose's Dispatchers.IO issue several
        // concurrent FFI calls (list_channels + list_categories + EPG
        // prefetch) without serializing on a single event loop.
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .thread_name("foundry-core-rt")
            .build()
        {
            Ok(rt) => {
                log::info!("tokio multi-thread runtime created (workers=4)");
                rt
            }
            Err(e) => {
                log::error!("tokio runtime creation failed: {}", e);
                panic!("tokio runtime: {}", e);
            }
        };
        ApiClient {
            inner: Arc::new(real_api::ApiClient::new(base_url)),
            rt: Arc::new(rt),
        }
    }

    /// Mutates the stored token on the single inner client. Does NOT
    /// rebuild the `reqwest::Client`.
    pub fn set_token(&self, token: String) {
        self.inner.set_token(token);
    }

    fn real(&self) -> Arc<real_api::ApiClient> {
        self.inner.clone()
    }

    // -----------------------------------------------------------------------
    // Channels + EPG
    // -----------------------------------------------------------------------

    pub fn list_channels(&self) -> Result<Vec<Channel>, ApiError> {
        log::info!("ApiClient::list_channels entered");
        let rt = self.rt.clone();
        let real = self.real();
        let channels = rt
            .block_on(async move { real.list_channels(None).await })
            .map_err(|e| {
                log::error!("list_channels failed: {:?}", e);
                ApiError::from(e)
            })?;
        log::info!("list_channels got {} results", channels.len());
        Ok(channels.into_iter().map(Channel::from).collect())
    }

    pub fn list_channels_by_category(
        &self,
        category_id: String,
    ) -> Result<Vec<Channel>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let channels = rt
            .block_on(async move { real.list_channels(Some(&category_id)).await })
            .map_err(ApiError::from)?;
        Ok(channels.into_iter().map(Channel::from).collect())
    }

    pub fn list_categories(&self) -> Result<Vec<Category>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let cats = rt
            .block_on(async move { real.list_categories().await })
            .map_err(ApiError::from)?;
        Ok(cats.into_iter().map(Category::from).collect())
    }

    pub fn get_epg(&self, channel_id: String, hours: u32) -> Result<Vec<EpgEntry>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let entries = rt
            .block_on(async move { real.get_epg(&channel_id, Some(hours)).await })
            .map_err(ApiError::from)?;
        Ok(entries.into_iter().map(EpgEntry::from).collect())
    }

    // -----------------------------------------------------------------------
    // Streaming
    // -----------------------------------------------------------------------

    pub fn start_stream(&self, channel_id: String) -> Result<StreamSession, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let session = rt
            .block_on(async move { real.start_stream(&channel_id, None).await })
            .map_err(ApiError::from)?;
        Ok(session.into())
    }

    pub fn stop_stream(&self, channel_id: String, sid: String) -> Result<(), ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.stop_stream(&channel_id, &sid).await })
            .map_err(ApiError::from)?;
        Ok(())
    }

    pub fn change_quality(&self, sid: String, quality: String) -> Result<String, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.change_quality(&sid, &quality).await })
            .map_err(ApiError::from)
    }

    // -----------------------------------------------------------------------
    // VOD / Series
    // -----------------------------------------------------------------------

    pub fn list_vod(&self, category: Option<String>) -> Result<Vec<VodItem>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let vods = rt
            .block_on(async move { real.list_vod(category.as_deref()).await })
            .map_err(ApiError::from)?;
        Ok(vods.into_iter().map(VodItem::from).collect())
    }

    pub fn get_vod_detail(&self, id: String) -> Result<String, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.get_vod_detail(&id).await })
            .map_err(ApiError::from)
    }

    pub fn list_series(&self, category: Option<String>) -> Result<Vec<SeriesItem>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let series = rt
            .block_on(async move { real.list_series(category.as_deref()).await })
            .map_err(ApiError::from)?;
        Ok(series.into_iter().map(SeriesItem::from).collect())
    }

    pub fn get_series_detail(&self, id: String) -> Result<String, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.get_series_detail(&id).await })
            .map_err(ApiError::from)
    }

    // -----------------------------------------------------------------------
    // Library (watched-only)
    // -----------------------------------------------------------------------

    pub fn list_library_live(&self) -> Result<Vec<Channel>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let channels = rt
            .block_on(async move { real.list_library_live().await })
            .map_err(ApiError::from)?;
        Ok(channels.into_iter().map(Channel::from).collect())
    }

    pub fn list_library_vod(&self) -> Result<Vec<VodItem>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let vods = rt
            .block_on(async move { real.list_library_vod().await })
            .map_err(ApiError::from)?;
        Ok(vods.into_iter().map(VodItem::from).collect())
    }

    pub fn list_library_series(&self) -> Result<Vec<SeriesItem>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let series = rt
            .block_on(async move { real.list_library_series().await })
            .map_err(ApiError::from)?;
        Ok(series.into_iter().map(SeriesItem::from).collect())
    }

    // -----------------------------------------------------------------------
    // Decks
    // -----------------------------------------------------------------------

    pub fn list_decks(&self) -> Result<Vec<Deck>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let decks = rt
            .block_on(async move { real.get_decks().await })
            .map_err(ApiError::from)?;
        Ok(decks.into_iter().map(Deck::from).collect())
    }

    pub fn get_deck(&self, id: String) -> Result<Deck, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let deck = rt
            .block_on(async move { real.get_deck(&id).await })
            .map_err(ApiError::from)?;
        Ok(deck.into())
    }

    pub fn start_deck_stream(
        &self,
        deck_id: String,
        entry_index: u32,
        quality: Option<String>,
    ) -> Result<StreamSession, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let session = rt
            .block_on(async move {
                real.start_deck_stream(&deck_id, entry_index, quality.as_deref())
                    .await
            })
            .map_err(ApiError::from)?;
        Ok(session.into())
    }

    // -----------------------------------------------------------------------
    // Lists / favorites
    // -----------------------------------------------------------------------

    pub fn list_lists(&self) -> Result<Vec<UserList>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let lists = rt
            .block_on(async move { real.list_lists().await })
            .map_err(ApiError::from)?;
        Ok(lists.into_iter().map(UserList::from).collect())
    }

    pub fn list_list_channels(&self, list_id: String) -> Result<Vec<Channel>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let channels = rt
            .block_on(async move { real.list_list_channels(&list_id).await })
            .map_err(ApiError::from)?;
        Ok(channels.into_iter().map(Channel::from).collect())
    }

    pub fn add_to_list(&self, list_id: String, channel_id: String) -> Result<(), ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.add_to_list(&list_id, &channel_id).await })
            .map_err(ApiError::from)?;
        Ok(())
    }

    pub fn list_favorites(&self) -> Result<Vec<String>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.list_favorites().await })
            .map_err(ApiError::from)
    }

    pub fn toggle_favorite(&self, channel_id: String) -> Result<bool, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        rt.block_on(async move { real.toggle_favorite(&channel_id).await })
            .map_err(ApiError::from)
    }

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

    pub fn search(&self, query: String) -> Result<SearchResult, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let result = rt
            .block_on(async move { real.search(&query).await })
            .map_err(ApiError::from)?;
        Ok(result.into())
    }

    pub fn ai_search(&self, query: String) -> Result<SearchResult, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let result = rt
            .block_on(async move { real.ai_search(&query).await })
            .map_err(ApiError::from)?;
        Ok(result.into())
    }

    // -----------------------------------------------------------------------
    // Settings / history
    // -----------------------------------------------------------------------

    pub fn get_startup(&self) -> Result<StartupConfig, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let cfg = rt
            .block_on(async move { real.get_startup().await })
            .map_err(ApiError::from)?;
        Ok(cfg.into())
    }

    pub fn get_settings(&self) -> Result<UserSettings, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let settings = rt
            .block_on(async move { real.get_settings().await })
            .map_err(ApiError::from)?;
        Ok(settings.into())
    }

    pub fn list_watch_history(&self) -> Result<Vec<WatchHistoryEntry>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let entries = rt
            .block_on(async move { real.list_watch_history().await })
            .map_err(ApiError::from)?;
        Ok(entries.into_iter().map(WatchHistoryEntry::from).collect())
    }

    /// POST /api/history — record a watch event. Fire-and-forget: errors
    /// are logged but do not fail the FFI call, matching the web's
    /// pattern where the player does not block on history writes.
    pub fn record_watch_history(
        &self,
        media_type: MediaType,
        id: String,
        _display_name: Option<String>,
    ) {
        let rt = self.rt.clone();
        let real = self.real();
        let mt = media_type.as_str().to_string();
        let res = rt.block_on(async move { real.record_watch_history(&mt, &id).await });
        if let Err(e) = res {
            log::warn!("record_watch_history failed: {:?}", e);
        }
    }

    /// POST /api/stream/vod/<streamId> — start a VOD playback session.
    pub fn start_vod_stream(
        &self,
        stream_id: String,
        ext: Option<String>,
    ) -> Result<VodStreamSession, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let session = rt
            .block_on(async move { real.start_vod_stream(&stream_id, ext.as_deref()).await })
            .map_err(ApiError::from)?;
        Ok(session.into())
    }

    /// POST /api/stream/vod/<episodeId> with type=series — start a
    /// series episode playback session.
    pub fn start_episode_stream(
        &self,
        episode_id: String,
        ext: Option<String>,
    ) -> Result<VodStreamSession, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let session = rt
            .block_on(async move {
                real.start_episode_stream(&episode_id, ext.as_deref()).await
            })
            .map_err(ApiError::from)?;
        Ok(session.into())
    }

    /// Parallel fan-out over GET /api/epg/<id>. Concurrency bounded to
    /// 16 in-flight requests inside Rust. Returns one entry per input
    /// channel id in arbitrary order; failed fetches return an empty
    /// program list so the caller can still render the rest.
    pub fn get_epg_batch(
        &self,
        channel_ids: Vec<String>,
        hours: u32,
    ) -> Result<Vec<EpgBatchEntry>, ApiError> {
        let rt = self.rt.clone();
        let real = self.real();
        let results = rt
            .block_on(async move { real.get_epg_batch(&channel_ids, Some(hours)).await })
            .map_err(ApiError::from)?;
        Ok(results
            .into_iter()
            .map(|(cid, progs)| EpgBatchEntry {
                channel_id: cid,
                programs: progs.into_iter().map(EpgEntry::from).collect(),
            })
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Namespace-level function
// ---------------------------------------------------------------------------

/// Blocking pairing-code exchange. Spins up a one-shot tokio runtime.
pub fn exchange_pairing_code(
    base_url: String,
    code: String,
    label: String,
) -> Result<String, AuthError> {
    let rt = Runtime::new().map_err(|e| AuthError::Parse { msg: e.to_string() })?;
    let auth = rt
        .block_on(async move {
            real_auth::DeviceAuth::exchange_pairing_code(&base_url, &code, &label).await
        })
        .map_err(AuthError::from)?;
    Ok(auth.token)
}
