use crate::{Rect, WindowInfo};

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
