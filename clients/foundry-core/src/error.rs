use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Not authenticated — call DeviceAuth::exchange_pairing_code first")]
    Unauthenticated,

    #[error("Server returned {status}: {body}")]
    Server { status: u16, body: String },

    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("HTTP error during pairing: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Server rejected pairing code (status {status}): {body}")]
    Rejected { status: u16, body: String },

    #[error("Invalid response from server: {0}")]
    Parse(String),
}
