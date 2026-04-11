pub mod api;
pub mod auth;
pub mod config;
pub mod epg;
pub mod error;
pub mod keymap;
pub mod models;
pub mod state;
pub mod stream;

#[cfg(feature = "uniffi")]
pub mod ffi;

// Pure-Rust re-exports — always available for foundry-tv, tests, etc.
pub use auth::DeviceAuth;
pub use config::{load as load_config, save as save_config, Config};
pub use keymap::{from_android_keycode, from_key_name, Intent};
pub use state::{Action, AppState, Screen};
pub use stream::StreamController;

// When the `uniffi` feature is OFF, export the real async types at the crate
// root. When it's ON, the UDL names (`ApiClient`, `Channel`, etc.) must
// resolve to the FFI types at the crate root instead, so we skip these
// re-exports and let `ffi::*` take their place below.
#[cfg(not(feature = "uniffi"))]
pub use api::ApiClient;
#[cfg(not(feature = "uniffi"))]
pub use error::{ApiError, AuthError};
#[cfg(not(feature = "uniffi"))]
pub use models::{
    Category, Channel, Deck, DeckEntry, EpgEntry, SearchResult, SeriesItem, StartupConfig,
    StreamSession, UserList, UserSettings, ViewMode, VodItem, WatchHistoryEntry,
};

// uniffi scaffolding (generated from src/foundry-core.udl at build time).
// Only compiled when the `uniffi` feature is enabled. The generated code
// references `crate::ApiClient`, `crate::Channel`, `crate::ApiError` etc. —
// so under the uniffi feature we re-export those names from the ffi module.
#[cfg(feature = "uniffi")]
uniffi::include_scaffolding!("foundry_core");

#[cfg(feature = "uniffi")]
pub use ffi::{
    exchange_pairing_code, ApiClient, ApiError, AuthError, Category, Channel, Deck, DeckEntry,
    EpgEntry, SearchResult, SeriesItem, StartupConfig, StreamSession, UserList, UserSettings,
    VodItem, WatchHistoryEntry,
};
