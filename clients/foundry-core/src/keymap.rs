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
    PlayPause,
    ChannelUp,
    ChannelDown,
    /// Jump to a numbered deck (0-based index, Fire TV remote shortcut).
    Deck(u8),
    Exit,
}

// ---------------------------------------------------------------------------
// Android KeyEvent key codes
// (Values mirror android.view.KeyEvent constants)
// ---------------------------------------------------------------------------

/// Convert an Android `KeyEvent.keyCode` integer to an `Intent`, if recognised.
///
/// The mapping covers D-pad, media keys, Fire TV remote, and back/home.
pub fn from_android_keycode(code: i32) -> Option<Intent> {
    match code {
        19 => Some(Intent::Up),          // KEYCODE_DPAD_UP
        20 => Some(Intent::Down),        // KEYCODE_DPAD_DOWN
        21 => Some(Intent::Left),        // KEYCODE_DPAD_LEFT
        22 => Some(Intent::Right),       // KEYCODE_DPAD_RIGHT
        23 | 66 => Some(Intent::Select), // KEYCODE_DPAD_CENTER / KEYCODE_ENTER
        4 => Some(Intent::Back),         // KEYCODE_BACK
        3 => Some(Intent::Home),         // KEYCODE_HOME
        85 => Some(Intent::PlayPause),   // KEYCODE_MEDIA_PLAY_PAUSE
        126 => Some(Intent::Play),       // KEYCODE_MEDIA_PLAY
        127 => Some(Intent::Pause),      // KEYCODE_MEDIA_PAUSE
        166 => Some(Intent::ChannelUp),  // KEYCODE_CHANNEL_UP
        167 => Some(Intent::ChannelDown),// KEYCODE_CHANNEL_DOWN
        // Number keys 0-9 map to deck shortcuts
        7 => Some(Intent::Deck(0)),
        8 => Some(Intent::Deck(1)),
        9 => Some(Intent::Deck(2)),
        10 => Some(Intent::Deck(3)),
        11 => Some(Intent::Deck(4)),
        12 => Some(Intent::Deck(5)),
        13 => Some(Intent::Deck(6)),
        14 => Some(Intent::Deck(7)),
        15 => Some(Intent::Deck(8)),
        16 => Some(Intent::Deck(9)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Slint / winit KeyCode mapping (Linux desktop shell)
// ---------------------------------------------------------------------------

/// Convert a winit logical key name string to an `Intent`.
///
/// Rather than importing winit here (which brings in heavy deps to `foundry-core`),
/// we accept the string representation that `slint` / `winit` produce and match
/// on well-known values.  The `foundry-tv` shell calls this after converting
/// the `slint::platform::Key` to its character / name.
pub fn from_key_name(name: &str) -> Option<Intent> {
    match name {
        "ArrowUp" | "Up" => Some(Intent::Up),
        "ArrowDown" | "Down" => Some(Intent::Down),
        "ArrowLeft" | "Left" => Some(Intent::Left),
        "ArrowRight" | "Right" => Some(Intent::Right),
        "Return" | "Enter" => Some(Intent::Select),
        "Escape" | "Back" => Some(Intent::Back),
        " " => Some(Intent::PlayPause),
        _ => None,
    }
}
