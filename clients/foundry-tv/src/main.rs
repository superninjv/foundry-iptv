use anyhow::{Context, Result};
use foundry_core::{
    config::{self, Config},
    ApiClient, DeviceAuth, StreamController,
};
use std::sync::{Arc, Mutex};
use tracing::{error, info, warn};

slint::include_modules!();

fn main() -> Result<()> {
    // Build a Tokio runtime that runs in background threads so `tokio::spawn`
    // works from the Slint callbacks.  The runtime is kept alive for the
    // lifetime of `main`.
    let _rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .context("Failed to build Tokio runtime")?;
    let _guard = _rt.enter();

    // -----------------------------------------------------------------------
    // Logging
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // GStreamer init
    // -----------------------------------------------------------------------
    match gstreamer::init() {
        Ok(()) => info!("GStreamer initialised"),
        Err(e) => {
            warn!("GStreamer init failed ({e}). Video playback will not work. \
                   Install gstreamer1.0-plugins-base and gstreamer1.0-plugins-good.");
        }
    }

    // -----------------------------------------------------------------------
    // Load persisted config
    // -----------------------------------------------------------------------
    let cfg = config::load().unwrap_or_default();

    // -----------------------------------------------------------------------
    // Build Slint UI
    // -----------------------------------------------------------------------
    let ui = AppWindow::new().context("Failed to create AppWindow")?;

    // Determine initial screen based on stored config.
    let has_token = cfg.device_token.is_some() && cfg.server_url.is_some();
    if has_token {
        ui.set_current_screen(AppScreen::ChannelList);
    } else {
        ui.set_current_screen(AppScreen::Pairing);
    }

    // Shared stream controller (wrapped in Arc<Mutex> so the Drop cleanup can
    // run from a different thread)
    let stream_ctrl: Arc<Mutex<Option<StreamController>>> = Arc::new(Mutex::new(None));

    // -----------------------------------------------------------------------
    // Pairing callback
    // -----------------------------------------------------------------------
    {
        let ui_handle = ui.as_weak();
        let stream_ctrl = Arc::clone(&stream_ctrl);
        ui.on_pair_requested(move |server_url, pairing_code| {
            let ui_h = ui_handle.clone();
            let server_url = server_url.to_string();
            let pairing_code = pairing_code.trim().to_uppercase();

            tokio::spawn(async move {
                info!(%server_url, "Pairing requested");
                match DeviceAuth::exchange_pairing_code(&server_url, &pairing_code, "Foundry TV")
                    .await
                {
                    Ok(auth) => {
                        info!("Pairing succeeded");
                        // Save config
                        let cfg = Config {
                            server_url: Some(server_url.clone()),
                            device_token: Some(auth.token.clone()),
                        };
                        if let Err(e) = config::save(&cfg) {
                            error!("Failed to save config: {e}");
                        }
                        // Navigate to channel list
                        ui_h.upgrade_in_event_loop(move |ui| {
                            ui.set_current_screen(AppScreen::ChannelList);
                            // Kick off channel load
                            let client = ApiClient::new(&server_url).with_token(&auth.token);
                            trigger_channel_load(ui.as_weak(), client);
                        })
                        .ok();
                    }
                    Err(e) => {
                        error!("Pairing failed: {e}");
                        // TODO: surface error in UI
                    }
                }
            });
        });
    }

    // -----------------------------------------------------------------------
    // Channel selection callback
    // -----------------------------------------------------------------------
    {
        let ui_handle = ui.as_weak();
        let cfg_snap = cfg.clone();
        ui.on_channel_selected(move |channel_id| {
            let ui_h = ui_handle.clone();
            let channel_id = channel_id.to_string();
            let server_url = cfg_snap.server_url.clone().unwrap_or_default();
            let token = cfg_snap.device_token.clone().unwrap_or_default();

            tokio::spawn(async move {
                info!(%channel_id, "Channel selected — starting stream");
                let client = ApiClient::new(&server_url).with_token(&token);
                let mut ctrl = StreamController::new(client);
                match ctrl.start(&channel_id, None).await {
                    Ok(session) => {
                        let hls_url = session.hls_url.clone();
                        info!(%hls_url, "Stream started");

                        // Launch GStreamer playbin3 in a blocking thread.
                        let hls_url_clone = hls_url.clone();
                        std::thread::spawn(move || {
                            play_gstreamer(&hls_url_clone);
                        });

                        ui_h.upgrade_in_event_loop(move |ui| {
                            ui.set_now_playing_channel(channel_id.as_str().into());
                            ui.set_now_playing_program("".into());
                            ui.set_overlay_visible(true);
                            ui.set_current_screen(AppScreen::NowPlaying);
                        })
                        .ok();
                    }
                    Err(e) => {
                        error!("Failed to start stream: {e}");
                    }
                }
            });
        });
    }

    // -----------------------------------------------------------------------
    // Stop callback
    // -----------------------------------------------------------------------
    {
        let ui_handle = ui.as_weak();
        ui.on_stop_requested(move || {
            // Dropping the StreamController fires the cleanup DELETE.
            // The actual GStreamer pipeline will stop on its own when the
            // EOS is posted; for now we navigate away immediately.
            ui_handle
                .upgrade_in_event_loop(|ui| {
                    ui.set_current_screen(AppScreen::ChannelList);
                })
                .ok();
        });
    }

    // -----------------------------------------------------------------------
    // If we already have a token, kick off initial channel load
    // -----------------------------------------------------------------------
    if has_token {
        let server_url = cfg.server_url.clone().unwrap();
        let token = cfg.device_token.clone().unwrap();
        let client = ApiClient::new(&server_url).with_token(&token);
        trigger_channel_load(ui.as_weak(), client);
    }

    // -----------------------------------------------------------------------
    // Signal handling (SIGTERM / Ctrl-C)
    // -----------------------------------------------------------------------
    {
        let ui_handle = ui.as_weak();
        ctrlc::set_handler(move || {
            info!("Shutdown signal received — exiting");
            ui_handle.upgrade_in_event_loop(|ui| { ui.window().hide().ok(); }).ok();
        })
        .ok();
    }

    // Run the Slint event loop (blocks until window is closed).
    ui.run()?;
    info!("Foundry TV exited cleanly");
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Spawn an async task that fetches channels and pushes them into the Slint model.
fn trigger_channel_load(ui_handle: slint::Weak<AppWindow>, client: ApiClient) {
    tokio::spawn(async move {
        match client.list_channels(None).await {
            Ok(channels) => {
                info!(count = channels.len(), "Channels loaded");
                let items: Vec<ChannelItem> = channels
                    .into_iter()
                    .map(|ch| ChannelItem {
                        id: ch.id.into(),
                        name: ch.name.into(),
                        group: ch.group.unwrap_or_default().into(),
                        logo_url: ch.logo_url.unwrap_or_default().into(),
                    })
                    .collect();
                ui_handle
                    .upgrade_in_event_loop(move |ui| {
                        let model = std::rc::Rc::new(slint::VecModel::from(items));
                        ui.set_channels(model.into());
                    })
                    .ok();
            }
            Err(e) => {
                error!("Failed to load channels: {e}");
            }
        }
    });
}

/// Launch a GStreamer `playbin3` pipeline for the given HLS URL.
/// Blocks until EOS or error. Runs in a dedicated OS thread.
fn play_gstreamer(hls_url: &str) {
    use gstreamer::prelude::*;

    info!(%hls_url, "GStreamer: starting playbin3");

    let pipeline = match gstreamer::parse::launch(&format!(
        "playbin3 uri=\"{hls_url}\""
    )) {
        Ok(p) => p,
        Err(e) => {
            error!("GStreamer pipeline creation failed: {e}");
            return;
        }
    };

    if pipeline
        .set_state(gstreamer::State::Playing)
        .is_err()
    {
        error!("GStreamer: failed to set pipeline to Playing");
        return;
    }

    let bus = pipeline.bus().expect("Pipeline has no bus");
    for msg in bus.iter_timed(gstreamer::ClockTime::NONE) {
        use gstreamer::MessageView;
        match msg.view() {
            MessageView::Eos(..) => {
                info!("GStreamer: EOS");
                break;
            }
            MessageView::Error(err) => {
                error!(
                    "GStreamer error from {:?}: {} ({:?})",
                    err.src().map(|s| s.path_string()),
                    err.error(),
                    err.debug()
                );
                break;
            }
            _ => {}
        }
    }

    pipeline.set_state(gstreamer::State::Null).ok();
    info!("GStreamer: pipeline stopped");
}
