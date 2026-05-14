mod platform;

pub use platform::{
    apply_overlay_styles, find_window_by_title, focus_window, get_window_rect, is_window_alive,
};

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

/// Find the running Path of Exile 2 game window, if any.
pub fn find_poe2_window() -> Option<WindowInfo> {
    POE2_TITLES
        .iter()
        .find_map(|title| find_window_by_title(title))
}
