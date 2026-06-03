use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};

use windows_sys::Win32::{
    Foundation::{BOOL, FALSE, HWND, LPARAM, LRESULT, RECT, TRUE, WPARAM},
    UI::Input::KeyboardAndMouse::GetAsyncKeyState,
    UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, EnumWindows, GetForegroundWindow, GetMessageW,
        GetWindowLongPtrW, GetWindowRect as WinGetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        IsWindow, IsWindowVisible, SetForegroundWindow, SetWindowLongPtrW, SetWindowsHookExW,
        TranslateMessage, GWL_EXSTYLE, HC_ACTION, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
        WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WS_EX_NOACTIVATE,
    },
};

use crate::{KeyChord, Rect, WindowInfo};

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

// ── Low-level keyboard hook (auto-hide triggers) ──────────────────────────────
//
// A WH_KEYBOARD_LL hook lets us *observe* game keybinds (e.g. `i`, `m`, `Ctrl+U`)
// while the game is focused, without consuming them — the hook always forwards
// the keystroke via CallNextHookEx, so the game still opens its panels. When a
// configured chord is pressed and Path of Exile 2 is the foreground window, the
// registered callback fires (the app uses it to hide the overlay).

/// Window that must be foreground for triggers to fire (0 = disabled).
static FOREGROUND_TARGET: AtomicIsize = AtomicIsize::new(0);
/// Active trigger chords. `try_lock`ed inside the hook to never block input.
static CHORDS: Mutex<Vec<KeyChord>> = Mutex::new(Vec::new());
/// Virtual-key codes currently held down — used to ignore OS auto-repeat so a
/// held key fires the callback only once per physical press.
static DOWN: Mutex<Vec<u32>> = Mutex::new(Vec::new());
/// Callback invoked when a chord matches while the target window is foreground.
static CALLBACK: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

const VK_SHIFT: u32 = 0x10;
const VK_CONTROL: u32 = 0x11;
const VK_MENU: u32 = 0x12; // Alt
const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;

fn is_modifier_vk(vk: u32) -> bool {
    // Includes the left/right-specific variants Windows may report.
    matches!(
        vk,
        VK_SHIFT | VK_CONTROL | VK_MENU | VK_LWIN | VK_RWIN | 0xA0..=0xA5
    )
}

fn key_is_down(vk: u32) -> bool {
    (unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000) != 0
}

unsafe extern "system" fn ll_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
        let vk = kb.vkCode;
        let msg = wparam as u32;

        if msg == WM_KEYUP || msg == WM_SYSKEYUP {
            if let Ok(mut down) = DOWN.try_lock() {
                down.retain(|&v| v != vk);
            }
        } else if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            // Edge-detect: skip if this key was already held (auto-repeat).
            let mut is_repeat = false;
            if let Ok(mut down) = DOWN.try_lock() {
                if down.contains(&vk) {
                    is_repeat = true;
                } else {
                    down.push(vk);
                }
            }

            if !is_repeat && !is_modifier_vk(vk) {
                let target = FOREGROUND_TARGET.load(Ordering::Relaxed);
                if target != 0 && GetForegroundWindow() as isize == target {
                    let ctrl = key_is_down(VK_CONTROL);
                    let shift = key_is_down(VK_SHIFT);
                    let alt = key_is_down(VK_MENU);
                    if let Ok(chords) = CHORDS.try_lock() {
                        let matched = chords.iter().any(|c| {
                            c.vk == vk && c.ctrl == ctrl && c.shift == shift && c.alt == alt
                        });
                        if matched {
                            if let Some(cb) = CALLBACK.get() {
                                cb();
                            }
                        }
                    }
                }
            }
        }
    }

    CallNextHookEx(0, code, wparam, lparam)
}

/// Install the global low-level keyboard hook on a dedicated thread (which runs
/// the message loop the hook requires). Safe to ignore on failure — triggers
/// simply won't fire. The callback is stored once; later calls are no-ops.
pub fn start_keyboard_hook<F: Fn() + Send + Sync + 'static>(on_trigger: F) {
    if CALLBACK.set(Box::new(on_trigger)).is_err() {
        return; // already started
    }
    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_keyboard_proc), 0, 0);
        if hook == 0 {
            return;
        }
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

/// Set which window must be foreground for triggers to fire (0 disables them).
pub fn set_hook_foreground_target(hwnd: isize) {
    FOREGROUND_TARGET.store(hwnd, Ordering::Relaxed);
}

/// Replace the active set of trigger chords.
pub fn set_trigger_chords(chords: Vec<KeyChord>) {
    if let Ok(mut guard) = CHORDS.lock() {
        *guard = chords;
    }
}
