use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

use windows_sys::Win32::{
    Foundation::{BOOL, FALSE, HWND, LPARAM, RECT, TRUE},
    UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongPtrW, GetWindowRect as WinGetWindowRect, GetWindowTextLengthW,
        GetWindowTextW, IsWindow, IsWindowVisible, SetForegroundWindow, SetWindowLongPtrW,
        GWL_EXSTYLE, WS_EX_NOACTIVATE,
    },
};

use crate::{Rect, WindowInfo};

struct FindData {
    needle: String,
    result: Option<(HWND, String)>,
}

fn title_matches_needle(title: &str, needle: &str) -> bool {
    let normalized_title = title.trim().to_ascii_lowercase();
    let normalized_needle = needle.trim().to_ascii_lowercase();

    if normalized_title == normalized_needle {
        return true;
    }

    // Allow common variants while avoiding overly broad substring matches.
    normalized_title.starts_with(&(normalized_needle.clone() + " -"))
        || normalized_title.starts_with(&(normalized_needle.clone() + " :"))
        || normalized_title.starts_with(&(normalized_needle + " ("))
}

unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam as *mut FindData);

    if IsWindowVisible(hwnd) == 0 {
        return TRUE;
    }

    let len = GetWindowTextLengthW(hwnd);
    if len == 0 {
        return TRUE;
    }

    let mut buf: Vec<u16> = vec![0u16; (len + 1) as usize];
    let written = GetWindowTextW(hwnd, buf.as_mut_ptr(), len + 1);
    if written == 0 {
        return TRUE;
    }

    let title = OsString::from_wide(&buf[..written as usize])
        .to_string_lossy()
        .into_owned();

    if title_matches_needle(&title, &data.needle) {
        data.result = Some((hwnd, title));
        return FALSE; // stop enumeration
    }

    TRUE // continue
}

fn hwnd_to_isize(hwnd: HWND) -> isize {
    hwnd as isize
}

fn isize_to_hwnd(v: isize) -> HWND {
    v as usize as HWND
}

pub fn find_window_by_title(needle: &str) -> Option<WindowInfo> {
    let mut data = FindData {
        needle: needle.to_string(),
        result: None,
    };

    unsafe {
        EnumWindows(Some(enum_callback), &mut data as *mut FindData as LPARAM);
    }

    let (hwnd, title) = data.result?;
    let rect = get_rect_for_hwnd(hwnd)?;

    Some(WindowInfo {
        hwnd: hwnd_to_isize(hwnd),
        title,
        rect,
    })
}

fn get_rect_for_hwnd(hwnd: HWND) -> Option<Rect> {
    let mut r = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let ok = unsafe { WinGetWindowRect(hwnd, &mut r) };
    if ok == 0 {
        return None;
    }
    Some(Rect {
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
    })
}

pub fn get_window_rect(hwnd: isize) -> Option<Rect> {
    get_rect_for_hwnd(isize_to_hwnd(hwnd))
}

pub fn is_window_alive(hwnd: isize) -> bool {
    unsafe { IsWindow(isize_to_hwnd(hwnd)) != 0 }
}

pub fn focus_window(hwnd: isize) -> bool {
    unsafe { SetForegroundWindow(isize_to_hwnd(hwnd)) != 0 }
}

/// Sets WS_EX_NOACTIVATE on the window so it never steals input focus.
pub fn apply_overlay_styles(hwnd: isize) {
    let raw = isize_to_hwnd(hwnd);
    unsafe {
        let current = GetWindowLongPtrW(raw, GWL_EXSTYLE);
        SetWindowLongPtrW(raw, GWL_EXSTYLE, current | WS_EX_NOACTIVATE as isize);
    }
}
