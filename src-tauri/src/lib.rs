use std::collections::HashMap;
use std::sync::Mutex;

use overlay_core::{find_poe2_window, focus_window, is_window_alive, WindowInfo};
use tauri::{AppHandle, Manager, State, WebviewWindow};

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

// ── Persistent settings store (disk-backed) ──────────────────────────────────
//
// WebView2's localStorage is not reliably persisted across dev restarts, so
// config values that must survive restarts (e.g. the chosen log file path) are
// stored in a real JSON file under the OS app-config directory instead.

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> HashMap<String, String> {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(app: &AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn store_get(app: AppHandle, key: String) -> Option<String> {
    read_settings(&app).get(&key).cloned()
}

#[tauri::command]
fn store_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let mut map = read_settings(&app);
    map.insert(key, value);
    write_settings(&app, &map)
}

#[tauri::command]
fn store_remove(app: AppHandle, key: String) -> Result<(), String> {
    let mut map = read_settings(&app);
    map.remove(&key);
    write_settings(&app, &map)
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

// ── Log file tail-reading ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct LogTailResult {
    lines: Vec<String>,
    file_size: u64,
}

/// Read new lines from a log file starting at `from_byte`.
/// Returns the lines added since that offset plus the current file size.
/// If the file is smaller than `from_byte` (truncated/rotated), `file_size`
/// will be less than `from_byte` and the caller should reset its offset.
#[tauri::command]
fn read_log_tail(path: String, from_byte: u64) -> Result<LogTailResult, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let file_size = file.metadata().map_err(|e| e.to_string())?.len();

    let start = from_byte.min(file_size);
    if start >= file_size {
        return Ok(LogTailResult { lines: vec![], file_size });
    }

    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let lines = reader.lines().filter_map(|l| l.ok()).collect();

    Ok(LogTailResult { lines, file_size })
}

/// Read an entire UTF-8 text file (used for importing GGG `.build` files).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ── pobb.in fetch (bypasses browser CORS) ────────────────────────────────────

/// Fetch the raw PoB export code for a given pobb.in build ID.
/// Done from Rust so browser CORS restrictions don't apply.
#[tauri::command]
async fn fetch_pobb_code(build_id: String) -> Result<String, String> {
    let url = format!("https://pobb.in/{}/raw", build_id);
    let client = reqwest::Client::builder()
        .user_agent("ExileCompass/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error fetching pobb.in: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "pobb.in returned HTTP {} — paste the export code directly instead",
            response.status()
        ));
    }

    response.text().await.map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            read_log_tail,
            read_text_file,
            fetch_pobb_code,
            store_get,
            store_set,
            store_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
