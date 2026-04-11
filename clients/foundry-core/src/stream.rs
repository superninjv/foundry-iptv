use crate::api::ApiClient;
use crate::error::ApiError;
use crate::models::StreamSession;
use tracing::{error, info};

/// Manages the lifecycle of a single HLS stream session.
///
/// On drop, if a session is still active, a best-effort DELETE is fired via
/// `tokio::spawn` so the server can clean up the ts2hls process.
pub struct StreamController {
    api: ApiClient,
    current: Option<StreamSession>,
}

impl StreamController {
    pub fn new(api: ApiClient) -> Self {
        Self {
            api,
            current: None,
        }
    }

    /// Start streaming `channel_id`. Stores the session internally.
    /// If another session is active it is stopped first.
    pub async fn start(
        &mut self,
        channel_id: &str,
        quality: Option<&str>,
    ) -> Result<&StreamSession, ApiError> {
        // Stop any existing session first.
        if self.current.is_some() {
            self.stop().await.ok();
        }

        info!(channel_id, "Starting stream");
        let session = self.api.start_stream(channel_id, quality).await?;
        self.current = Some(session);
        Ok(self.current.as_ref().unwrap())
    }

    /// Stop the current session, if any.
    pub async fn stop(&mut self) -> Result<(), ApiError> {
        if let Some(session) = self.current.take() {
            info!(sid = %session.sid, "Stopping stream");
            self.api
                .stop_stream(&session.channel_id, &session.sid)
                .await?;
        }
        Ok(())
    }

    /// The current live session, if any.
    pub fn current(&self) -> Option<&StreamSession> {
        self.current.as_ref()
    }
}

impl Drop for StreamController {
    fn drop(&mut self) {
        if let Some(session) = self.current.take() {
            // Clone what we need for the async cleanup task.
            let base_url = self.api.base_url.clone();
            let token = self.api.token_for_cleanup();
            let channel_id = session.channel_id.clone();
            let sid = session.sid.clone();

            tokio::spawn(async move {
                let mut client = ApiClient::new(base_url);
                if let Some(t) = token {
                    client = client.with_token(t);
                }
                if let Err(e) = client.stop_stream(&channel_id, &sid).await {
                    error!("Cleanup DELETE failed: {e}");
                }
            });
        }
    }
}
