/// Platform-agnostic user intent.
///
/// Platform shells (Linux evdev, Android KeyEvent) translate native events
/// into Intents, which are then dispatched to the state machine via `Action`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Intent {
    Up,
    Down,
    Left,
    Right,
    Select,
    Back,
    Home,
    Play,
    Pause,
    ChannelUp,
    ChannelDown,
    /// Jump to a numbered deck (0-based index, Fire TV remote shortcut).
    Deck(u8),
    Exit,
}
