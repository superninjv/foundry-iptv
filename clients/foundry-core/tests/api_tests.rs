use foundry_core::{ApiClient, Channel};
use wiremock::matchers::{header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const TOKEN: &str = "test-token-abc";

fn authed_client(base_url: &str) -> ApiClient {
    ApiClient::new(base_url).with_token(TOKEN)
}

// ---------------------------------------------------------------------------
// /api/channels
// ---------------------------------------------------------------------------

#[tokio::test]
async fn list_channels_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/channels"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "channels": [
                {
                    "id": "ch-abc",
                    "name": "CNN",
                    "group": "News",
                    "logo_url": null,
                    "tvg_id": "CNN"
                }
            ]
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let channels = client.list_channels(None).await.expect("list_channels failed");
    assert_eq!(channels.len(), 1);
    assert_eq!(channels[0].id, "ch-abc");
    assert_eq!(channels[0].name, "CNN");
}

#[tokio::test]
async fn list_channels_with_category() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/channels"))
        .and(query_param("category", "News"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "channels": []
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let channels = client
        .list_channels(Some("News"))
        .await
        .expect("list_channels with category failed");
    assert!(channels.is_empty());
}

#[tokio::test]
async fn list_channels_unauthorized() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/channels"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;

    // Client with wrong token — should get Unauthenticated error
    let client = ApiClient::new(server.uri()).with_token("bad-token");
    let err = client.list_channels(None).await;
    assert!(err.is_err());
    assert!(matches!(
        err.unwrap_err(),
        foundry_core::ApiError::Unauthenticated
    ));
}

// ---------------------------------------------------------------------------
// /api/epg/<channelId>
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_epg_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/epg/ch-abc"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "programs": [
                {
                    "channel_id": "ch-abc",
                    "start": "2026-04-11T10:00:00Z",
                    "end":   "2026-04-11T11:00:00Z",
                    "title": "Morning News",
                    "description": null
                }
            ]
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let entries = client.get_epg("ch-abc").await.expect("get_epg failed");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].title, "Morning News");
}

// ---------------------------------------------------------------------------
// /api/stream/<channelId>
// ---------------------------------------------------------------------------

#[tokio::test]
async fn start_stream_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/api/stream/ch-abc"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "sid": "sess-1234",
            "hlsUrl": "http://foundry.local/hls/sess-1234/index.m3u8",
            "sourceWidth": 1920,
            "sourceHeight": 1080
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let session = client
        .start_stream("ch-abc", None)
        .await
        .expect("start_stream failed");
    assert_eq!(session.sid, "sess-1234");
    assert_eq!(session.channel_id, "ch-abc");
    assert!(session.hls_url.contains("sess-1234"));
}

// ---------------------------------------------------------------------------
// /api/stream DELETE
// ---------------------------------------------------------------------------

#[tokio::test]
async fn stop_stream_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("DELETE"))
        .and(path("/api/stream/ch-abc"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(204))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    client
        .stop_stream("ch-abc", "sess-1234")
        .await
        .expect("stop_stream failed");
}

// ---------------------------------------------------------------------------
// /api/startup
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_startup_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/startup"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "default_deck_id": null,
            "default_view_mode": "single",
            "allow_user_override": true
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let cfg = client.get_startup().await.expect("get_startup failed");
    assert!(cfg.default_deck_id.is_none());
    assert!(cfg.allow_user_override);
}

// ---------------------------------------------------------------------------
// /api/decks
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_decks_happy_path() {
    let server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/api/decks"))
        .and(header("Authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "decks": [
                { "id": "d1", "name": "Sports", "entries": [] }
            ]
        })))
        .mount(&server)
        .await;

    let client = authed_client(&server.uri());
    let decks = client.get_decks().await.expect("get_decks failed");
    assert_eq!(decks.len(), 1);
    assert_eq!(decks[0].name, "Sports");
}
