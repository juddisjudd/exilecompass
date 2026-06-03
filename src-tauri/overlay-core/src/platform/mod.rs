use crate::{KeyChord, Rect, WindowInfo};

#[cfg(target_os = "windows")]
mod windows;

#[cfg(not(target_os = "windows"))]
mod stub;

#[cfg(target_os = "windows")]
use windows as imp;

#[cfg(not(target_os = "windows"))]
use stub as imp;

/// Find a visible window whose title contains `needle` (case-insensitive).
pub fn find_window_by_title(needle: &str) -> Option<WindowInfo> {
    imp::find_window_by_title(needle)
}

/// Get the current bounding rect of a window by raw handle.
pub fn get_window_rect(hwnd: isize) -> Option<Rect> {
    imp::get_window_rect(hwnd)
}

/// Returns true if the window handle still refers to a live window.
pub fn is_window_alive(hwnd: isize) -> bool {
    imp::is_window_alive(hwnd)
}

/// Bring the specified window to the foreground (switch focus to it).
pub fn focus_window(hwnd: isize) -> bool {
    imp::focus_window(hwnd)
}

/// Apply extended window styles that make a window behave as a non-intrusive overlay:
/// on Windows this sets WS_EX_NOACTIVATE so the overlay never steals focus from the game.
pub fn apply_overlay_styles(hwnd: isize) {
    imp::apply_overlay_styles(hwnd);
}

/// Install a global low-level keyboard hook that fires `on_trigger` when a
/// configured chord is pressed while the target window is foreground. On
/// non-Windows platforms this is a no-op.
pub fn start_keyboard_hook<F: Fn() + Send + Sync + 'static>(on_trigger: F) {
    imp::start_keyboard_hook(on_trigger);
}

/// Set which window (raw handle) must be foreground for triggers to fire; 0 disables.
pub fn set_hook_foreground_target(hwnd: isize) {
    imp::set_hook_foreground_target(hwnd);
}

/// Replace the active set of auto-hide trigger chords.
pub fn set_trigger_chords(chords: Vec<KeyChord>) {
    imp::set_trigger_chords(chords);
}
