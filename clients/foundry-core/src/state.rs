use crate::stream::StreamSession;

/// Top-level screen the UI is on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Screen {
    Live,
    Guide,
    DeckList,
    /// A named deck session (deck ID).
    Deck(String),
    /// Watching a channel (channel ID).
    Watch(String),
    Settings,
}

/// Full application state. Kept minimal for the scaffold; will grow with impl.
#[derive(Debug, Clone)]
pub struct AppState {
    pub screen: Screen,
    pub selected_deck: Option<String>,
    pub now_playing: Option<StreamSession>,
    pub error: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            screen: Screen::Live,
            selected_deck: None,
            now_playing: None,
            error: None,
        }
    }
}

/// Dispatchable actions that drive state transitions.
#[derive(Debug, Clone)]
pub enum Action {
    Navigate(Screen),
    StartPlayback(String),
    StopPlayback,
    SetError(String),
    ClearError,
}

/// Pure reducer — no side effects.
pub fn reduce(state: AppState, action: Action) -> AppState {
    match action {
        Action::Navigate(screen) => AppState {
            screen,
            error: None,
            ..state
        },
        Action::StartPlayback(channel_id) => AppState {
            screen: Screen::Watch(channel_id.clone()),
            // StreamSession is filled in by the shell after negotiating with the API.
            now_playing: None,
            ..state
        },
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
    }
}
