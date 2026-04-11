use anyhow::Result;
use foundry_core::ApiClient;
use tracing::info;

slint::include_modules!();

fn main() -> Result<()> {
    // Initialise structured logging. RUST_LOG controls the filter.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "foundry_tv=info,foundry_core=info".into()),
        )
        .init();

    info!(
        version = env!("CARGO_PKG_VERSION"),
        target = std::env::consts::ARCH,
        "Foundry TV starting"
    );

    // TODO: load config from ~/.config/foundry-tv/config.toml
    // TODO: run pairing flow if no token stored
    let _api = ApiClient::new("http://localhost");

    // TODO: init GStreamer
    // gstreamer::init().expect("GStreamer initialisation failed");

    // Launch the Slint event loop.
    let ui = AppWindow::new()?;
    ui.run()?;

    Ok(())
}
