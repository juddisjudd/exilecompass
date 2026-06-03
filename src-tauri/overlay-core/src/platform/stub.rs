use crate::{KeyChord, Rect, WindowInfo};

pub fn find_window_by_title(_needle: &str) -> Option<WindowInfo> {
    None
}

pub fn get_window_rect(_hwnd: isize) -> Option<Rect> {
    None
}

pub fn is_window_alive(_hwnd: isize) -> bool {
    false
}

pub fn focus_window(_hwnd: isize) -> bool {
    false
}

pub fn apply_overlay_styles(_hwnd: isize) {}

pub fn start_keyboard_hook<F: Fn() + Send + Sync + 'static>(_on_trigger: F) {}

pub fn set_hook_foreground_target(_hwnd: isize) {}

pub fn set_trigger_chords(_chords: Vec<KeyChord>) {}
