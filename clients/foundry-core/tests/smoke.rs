use foundry_core::ApiClient;

/// Verify that constructing an ApiClient parses and stores the base URL
/// without panicking.  No network calls are made.
#[test]
fn api_client_stores_base_url() {
    let client = ApiClient::new("http://localhost:3000");
    assert_eq!(client.base_url, "http://localhost:3000");
}

#[test]
fn api_client_trims_trailing_slash() {
    let client = ApiClient::new("http://foundry.local/");
    assert_eq!(client.base_url, "http://foundry.local");
}
