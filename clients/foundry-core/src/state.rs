use crate::models::{Channel, StreamSession};

/// Top-level screen the UI is on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Screen {
    /// Pairing / first-run screen.
    Pairing,
    /// Channel list (live TV grid).
    Live,
    /// EPG guide.
    Guide,
    /// Deck list overview.
    DeckList,
    /// A named deck session (deck ID).
    Deck(String),
    /// Watching a channel — (channel_id, session_id).
    Watch(String, String),
    Settings,
}

/// Full application state. Pure data — no side effects.
#[derive(Debug, Clone)]
pub struct AppState {
    pub screen: Screen,
    pub channels: Vec<Channel>,
    pub selected_channel: Option<String>,
    pub now_playing: Option<StreamSession>,
    pub error: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            screen: Screen::Live,
            channels: Vec::new(),
            selected_channel: None,
            now_playing: None,
            error: None,
        }
    }
}

/// Dispatchable actions that drive state transitions.
#[derive(Debug, Clone)]
pub enum Action {
    Navigate(Screen),
    SelectChannel(String),
    StartPlayback(StreamSession),
    StopPlayback,
    SetError(String),
    ClearError,
    LoadChannels(Vec<Channel>),
}

/// Pure reducer — no side effects.
pub fn reduce(state: AppState, action: Action) -> AppState {
    match action {
        Action::Navigate(screen) => AppState {
            screen,
            error: None,
            ..state
        },
        Action::SelectChannel(id) => AppState {
            selected_channel: Some(id),
            ..state
        },
        Action::StartPlayback(session) => {
            let channel_id = session.channel_id.clone();
            let session_id = session.sid.clone();
            AppState {
                screen: Screen::Watch(channel_id, session_id),
                now_playing: Some(session),
                ..state
            }
        }
        Action::StopPlayback => AppState {
            now_playing: None,
            ..state
        },
        Action::SetError(msg) => AppState {
            error: Some(msg),
            ..state
        },
        Action::ClearError => AppState {
            error: None,
            ..state
        },
        Action::LoadChannels(channels) => AppState { channels, ..state },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigate_clears_error() {
        let state = AppState {
            error: Some("oops".into()),
            ..Default::default()
        };
        let next = reduce(state, Action::Navigate(Screen::Guide));
        assert_eq!(next.screen, Screen::Guide);
        assert!(next.error.is_none());
    }

    #[test]
    fn start_playback_sets_screen() {
        let state = AppState::default();
        let session = StreamSession {
            sid: "sess-1".into(),
            hls_url: "http://x/hls/1.m3u8".into(),
            channel_id: "ch-1".into(),
        };
        let next = reduce(state, Action::StartPlayback(session));
        assert_eq!(next.screen, Screen::Watch("ch-1".into(), "sess-1".into()));
        assert!(next.now_playing.is_some());
    }

    #[test]
    fn load_channels_stores_channels() {
        let state = AppState::default();
        let ch = Channel {
            id: "ch-1".into(),
            name: "CNN".into(),
            group: Some("News".into()),
            logo_url: None,
            tvg_id: None,
        };
        let next = reduce(state, Action::LoadChannels(vec![ch.clone()]));
        assert_eq!(next.channels.len(), 1);
        assert_eq!(next.channels[0].id, "ch-1");
    }
}
