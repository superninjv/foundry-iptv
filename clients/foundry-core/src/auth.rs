use crate::error::AuthError;
use serde::{Deserialize, Serialize};

/// Holds the server base URL and the device bearer token.
/// Obtained via `exchange_pairing_code` then persisted to the config file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceAuth {
    pub base_url: String,
    pub token: String,
}

#[derive(Serialize)]
struct PairingRequest<'a> {
    code: &'a str,
    label_hint: &'a str,
}

#[derive(Deserialize)]
struct PairingResponse {
    token: String,
}

impl DeviceAuth {
    /// Exchange a short-lived pairing code (generated in `/admin/devices`) for
    /// a long-lived device bearer token.
    ///
    /// Endpoint: `POST {base_url}/api/auth/device-token`
    /// Body: `{ "code": "...", "label_hint": "..." }`
    /// Response: `{ "token": "..." }`
    pub async fn exchange_pairing_code(
        base_url: &str,
        code: &str,
        label: &str,
    ) -> Result<Self, AuthError> {
        let client = reqwest::Client::new();
        let url = format!("{}/api/auth/device-token", base_url.trim_end_matches('/'));
        let resp = client
            .post(&url)
            .json(&PairingRequest {
                code,
                label_hint: label,
            })
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AuthError::Rejected { status, body });
        }

        let parsed: PairingResponse = resp
            .json()
            .await
            .map_err(|e| AuthError::Parse(e.to_string()))?;

        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token: parsed.token,
        })
    }

    /// Construct from a previously stored token (loaded from config file).
    pub fn from_stored(base_url: String, token: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    /// Inject the `Authorization: Bearer <token>` header into a request builder.
    pub fn authorize_request(
        &self,
        req: reqwest::RequestBuilder,
    ) -> reqwest::RequestBuilder {
        req.bearer_auth(&self.token)
    }
}
