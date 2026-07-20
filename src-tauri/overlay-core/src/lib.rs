mod platform;

pub use platform::{
    apply_overlay_styles, find_window_by_title, focus_window, get_window_rect, is_window_alive,
    set_hook_foreground_target, set_trigger_chords, start_keyboard_hook,
};

/// A keyboard chord (a key plus modifier state) used for auto-hide triggers.
/// `vk` is a Windows virtual-key code; modifiers are matched exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyChord {
    pub vk: u32,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WindowInfo {
    /// Raw platform window handle stored as isize (HWND on Windows).
    pub hwnd: isize,
    pub title: String,
    pub rect: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Path of Exile 2 window title patterns to try in order.
const POE2_TITLES: &[&str] = &["Path of Exile 2"];

/// Path of Exile (1) window title patterns to try in order.
const POE1_TITLES: &[&str] = &["Path of Exile"];

/// Find the running Path of Exile 2 game window, if any.
pub fn find_poe2_window() -> Option<WindowInfo> {
    POE2_TITLES
        .iter()
        .find_map(|title| find_window_by_title(title))
}

/// Find the running Path of Exile (1) game window, if any.
pub fn find_poe1_window() -> Option<WindowInfo> {
    POE1_TITLES
        .iter()
        .find_map(|title| find_window_by_title(title))
}
