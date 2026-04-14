use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Persisted client configuration stored at:
/// - Linux/macOS: `~/.config/foundry-tv/config.toml`
/// - Windows:     `%APPDATA%\foundry-tv\config.toml`
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    /// Base URL of the household Foundry IPTV server, e.g. `http://foundry.local`.
    pub server_url: Option<String>,
    /// Long-lived device bearer token obtained via the pairing flow.
    pub device_token: Option<String>,
}

/// Return the config file path for the current platform.
pub fn config_path() -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        dirs::data_local_dir()
    } else {
        dirs::config_dir()
    }?;
    Some(base.join("foundry-tv").join("config.toml"))
}

/// Load config from disk. Returns `Config::default()` if the file does not exist.
pub fn load() -> Result<Config, ApiError> {
    let path = match config_path() {
        Some(p) => p,
        None => return Ok(Config::default()),
    };

    if !path.exists() {
        return Ok(Config::default());
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| ApiError::Other(format!("Failed to read config: {e}")))?;
    let cfg: Config = toml::from_str(&contents)
        .map_err(|e| ApiError::Other(format!("Failed to parse config: {e}")))?;
    Ok(cfg)
}

/// Persist config to disk, creating parent directories if needed.
pub fn save(config: &Config) -> Result<(), ApiError> {
    let path = config_path()
        .ok_or_else(|| ApiError::Other("Cannot determine config directory".into()))?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ApiError::Other(format!("Failed to create config dir: {e}")))?;
    }

    let contents = toml::to_string_pretty(config)
        .map_err(|e| ApiError::Other(format!("Failed to serialise config: {e}")))?;

    std::fs::write(&path, contents)
        .map_err(|e| ApiError::Other(format!("Failed to write config: {e}")))?;
    Ok(())
}
