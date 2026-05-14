use std::sync::Mutex;

use overlay_core::{find_poe2_window, focus_window, is_window_alive, WindowInfo};
use tauri::{State, WebviewWindow};

struct OverlayState {
    game_hwnd: Mutex<Option<isize>>,
    click_through: Mutex<bool>,
}

impl OverlayState {
    fn new() -> Self {
        Self {
            game_hwnd: Mutex::new(None),
            click_through: Mutex::new(false),
        }
    }
}

// ── Log file detection ────────────────────────────────────────────────────────

/// Try to locate the Path of Exile 2 Client.txt log file automatically.
/// On Windows, first checks the running process via wmic, then falls back to
/// common install paths.  On Linux, checks common Steam/Wine paths.
#[tauri::command]
fn detect_log_file() -> Option<String> {
    #[cfg(target_os = "windows")]
    if let Some(path) = detect_log_from_process_windows() {
        return Some(path);
    }

    for path in candidate_log_paths() {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }
    None
}

/// Ask PowerShell for the executable path of any running PathOfExile process,
/// then derive logs/Client.txt from the parent directory.
/// wmic is deprecated and removed in Windows 11 — PowerShell Get-Process is reliable.
#[cfg(target_os = "windows")]
fn detect_log_from_process_windows() -> Option<String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-Process -Name 'PathOfExile*' -ErrorAction SilentlyContinue | Select-Object -First 1).Path",
        ])
        .output()
        .ok()?;

    let exe_path = String::from_utf8_lossy(&output.stdout);
    let exe = exe_path.trim();
    if exe.is_empty() {
        return None;
    }

    let candidate = std::path::Path::new(exe)
        .parent()?
        .join("logs")
        .join("Client.txt");

    if candidate.exists() {
        Some(candidate.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn candidate_log_paths() -> Vec<String> {
    let mut paths = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for var in &["PROGRAMFILES(X86)", "PROGRAMFILES"] {
            if let Ok(root) = std::env::var(var) {
                paths.push(format!(
                    r"{root}\Grinding Gear Games\Path of Exile 2\logs\Client.txt"
                ));
                paths.push(format!(
                    r"{root}\Steam\steamapps\common\Path of Exile 2\logs\Client.txt"
                ));
            }
        }
        // Hard-coded fallbacks in case env vars are absent
        for p in [
            r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile 2\logs\Client.txt",
            r"C:\Program Files\Grinding Gear Games\Path of Exile 2\logs\Client.txt",
            r"C:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2\logs\Client.txt",
            r"C:\Program Files\Steam\steamapps\common\Path of Exile 2\logs\Client.txt",
        ] {
            paths.push(p.to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let data_home = std::env::var("XDG_DATA_HOME")
            .unwrap_or_else(|_| format!("{home}/.local/share"));

        paths.extend([
            format!("{data_home}/Steam/steamapps/common/Path of Exile 2/logs/Client.txt"),
            format!("{home}/.steam/steam/steamapps/common/Path of Exile 2/logs/Client.txt"),
            format!("{home}/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/Path of Exile 2/logs/Client.txt"),
            format!("{home}/Games/path-of-exile-2/drive_c/Program Files/Grinding Gear Games/Path of Exile 2/logs/Client.txt"),
            format!("{home}/.wine/drive_c/Program Files/Grinding Gear Games/Path of Exile 2/logs/Client.txt"),
        ]);
    }

    paths
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Return the current PoE2 window info without attaching.
#[tauri::command]
fn find_game_window() -> Option<WindowInfo> {
    find_poe2_window()
}

/// Find and remember the PoE2 window handle. Does not move or resize the overlay.
#[tauri::command]
fn attach_to_game(state: State<'_, OverlayState>) -> Result<WindowInfo, String> {
    let info = find_poe2_window().ok_or("Path of Exile 2 window not found")?;
    *state.game_hwnd.lock().unwrap() = Some(info.hwnd);
    Ok(info)
}

/// Detach the overlay from the game window (stop tracking it).
#[tauri::command]
fn detach_from_game(state: State<'_, OverlayState>) {
    *state.game_hwnd.lock().unwrap() = None;
}

/// Toggle click-through / interactive mode for the overlay.
/// In click-through mode the overlay is visible but all mouse events pass to the game.
#[tauri::command]
fn set_click_through(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    enabled: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())?;
    *state.click_through.lock().unwrap() = enabled;
    Ok(())
}

/// Bring the attached game window to the foreground.
#[tauri::command]
fn focus_game(state: State<'_, OverlayState>) -> bool {
    let hwnd = *state.game_hwnd.lock().unwrap();
    match hwnd {
        Some(h) if is_window_alive(h) => focus_window(h),
        _ => false,
    }
}

/// Return current overlay status for the frontend.
#[tauri::command]
fn get_overlay_status(state: State<'_, OverlayState>) -> serde_json::Value {
    let hwnd = *state.game_hwnd.lock().unwrap();
    let click_through = *state.click_through.lock().unwrap();
    let game_alive = hwnd.map(is_window_alive).unwrap_or(false);

    serde_json::json!({
        "attached": hwnd.is_some() && game_alive,
        "clickThrough": click_through,
        "gameRunning": find_poe2_window().is_some(),
    })
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(OverlayState::new())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            find_game_window,
            attach_to_game,
            detach_from_game,
            set_click_through,
            focus_game,
            get_overlay_status,
            detect_log_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
