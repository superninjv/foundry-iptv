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

use std::sync::{Arc, Mutex, Once};
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

// ---------------------------------------------------------------------------
// ApiClient — blocking façade around the async client.
// ---------------------------------------------------------------------------

pub struct ApiClient {
    inner: Mutex<real_api::ApiClient>,
    rt: Arc<Runtime>,
}

impl ApiClient {
    /// Constructor called from Kotlin as `ApiClient("http://host")`.
    /// uniffi wraps the returned value in `Arc` for us.
    pub fn new(base_url: String) -> Self {
        init_logger();
        log::info!("ApiClient::new base_url={}", base_url);
        let rt = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => {
                log::info!("tokio current-thread runtime created");
                rt
            }
            Err(e) => {
                log::error!("tokio runtime creation failed: {}", e);
                panic!("tokio runtime: {}", e);
            }
        };
        ApiClient {
            inner: Mutex::new(real_api::ApiClient::new(base_url)),
            rt: Arc::new(rt),
        }
    }

    pub fn set_token(&self, token: String) {
        // `with_token` is a builder so we rebuild the inner client. This is
        // fine — it's just a reqwest::Client behind it and doesn't own any
        // persistent state.
        let mut guard = self.inner.lock().unwrap();
        let base = guard.base_url.clone();
        *guard = real_api::ApiClient::new(base).with_token(token);
    }

    pub fn list_channels(&self) -> Result<Vec<Channel>, ApiError> {
        log::info!("ApiClient::list_channels entered");
        let rt = self.rt.clone();
        let (base, token) = {
            let guard = self.inner.lock().unwrap();
            (guard.base_url.clone(), guard.token_for_cleanup())
        };
        log::info!("list_channels base={} have_token={}", base, token.is_some());
        let mut real = real_api::ApiClient::new(base);
        if let Some(t) = token {
            real = real.with_token(t);
        }
        log::info!("list_channels about to block_on reqwest");
        let channels = rt
            .block_on(async move { real.list_channels(None).await })
            .map_err(|e| {
                log::error!("list_channels failed: {:?}", e);
                ApiError::from(e)
            })?;
        log::info!("list_channels got {} results", channels.len());
        Ok(channels.into_iter().map(Channel::from).collect())
    }

    pub fn start_stream(&self, channel_id: String) -> Result<StreamSession, ApiError> {
        let rt = self.rt.clone();
        let (base, token) = {
            let guard = self.inner.lock().unwrap();
            (guard.base_url.clone(), guard.token_for_cleanup())
        };
        let mut real = real_api::ApiClient::new(base);
        if let Some(t) = token {
            real = real.with_token(t);
        }
        let session = rt
            .block_on(async move { real.start_stream(&channel_id, None).await })
            .map_err(ApiError::from)?;
        Ok(session.into())
    }

    pub fn stop_stream(&self, channel_id: String, sid: String) -> Result<(), ApiError> {
        let rt = self.rt.clone();
        let (base, token) = {
            let guard = self.inner.lock().unwrap();
            (guard.base_url.clone(), guard.token_for_cleanup())
        };
        let mut real = real_api::ApiClient::new(base);
        if let Some(t) = token {
            real = real.with_token(t);
        }
        rt.block_on(async move { real.stop_stream(&channel_id, &sid).await })
            .map_err(ApiError::from)?;
        Ok(())
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
        .block_on(async move { real_auth::DeviceAuth::exchange_pairing_code(&base_url, &code, &label).await })
        .map_err(AuthError::from)?;
    Ok(auth.token)
}
