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

// ── Crash logging ─────────────────────────────────────────────────────────────
//
// On Linux the app is usually launched without an attached console, so a panic
// or a failed `Builder::run` leaves the user with nothing to report. Persist the
// error to a file under the OS data dir (no AppHandle required) so it can be
// retrieved after the fact.

fn crash_log_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(|d| std::path::PathBuf::from(d).join("ExileCompass").join("logs"))
    }
    #[cfg(target_os = "linux")]
    {
        let data = std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|h| std::path::PathBuf::from(h).join(".local").join("share"))
            });
        data.map(|d| d.join("exilecompass").join("logs"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

fn write_crash_log(contents: &str) {
    if let Some(dir) = crash_log_dir() {
        if std::fs::create_dir_all(&dir).is_ok() {
            let _ = std::fs::write(dir.join("crash.txt"), contents);
        }
    }
    eprintln!("ExileCompass crashed: {contents}");
}

/// Decide whether the overlay window should be transparent.
/// Transparency relies on WebKitGTK's GPU compositing, which fails to initialize
/// on many Linux GPU/driver/Wayland combinations and is the most common reason
/// the app "won't open". Default it off on Linux; let users opt back in with
/// `EXILECOMPASS_TRANSPARENT=1` if their compositor handles it.
fn want_transparent() -> bool {
    if cfg!(target_os = "linux") {
        // Software rendering disables compositing, so transparency would paint
        // black — never request it in that mode.
        std::env::var_os("EXILECOMPASS_TRANSPARENT").is_some()
            && std::env::var_os("EXILECOMPASS_SOFTWARE_RENDER").is_none()
    } else {
        true
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK ≥2.40 defaults to a DMA-BUF EGL renderer that aborts with
        // "Could not create default EGL display: EGL_BAD_PARAMETER" on many Linux
        // GPU/driver/compositor combos. Disable it before GTK initializes. Respect
        // an explicit user override so anyone who wants the DMA-BUF path can keep it.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // Disabling GPU compositing entirely fixes the remaining "blank window /
        // won't start" reports on driver/Wayland setups the DMA-BUF flag alone
        // doesn't cover. It also defeats window transparency, so only apply it
        // when we're not trying to render a transparent overlay anyway.
        if !want_transparent()
            && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
        {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        // Last resort for "Could not create default EGL display: EGL_BAD_PARAMETER.
        // Aborting..." — the hardware EGL/GL stack can't initialize even with
        // DMA-BUF and compositing disabled (seen on some NVIDIA / Wayland / VM
        // setups), so WebKitGTK aborts and the window never paints. Force Mesa
        // software rendering, which brings up an EGL display via llvmpipe instead
        // of the broken driver. Opt-in (trades GPU for CPU) and implies no
        // compositing, so transparency is off in this mode.
        if std::env::var_os("EXILECOMPASS_SOFTWARE_RENDER").is_some() {
            std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    // Persist panic info so headless Linux launches leave something to report.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write_crash_log(&info.to_string());
        default_hook(info);
    }));

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(OverlayState::new())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Window is built here (not in tauri.conf.json) so transparency can be
            // decided per-platform. Keep these props in sync with the config notes.
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("ExileCompass")
                .inner_size(553.0, 680.0)
                .decorations(false)
                .transparent(want_transparent())
                .always_on_top(true)
                .resizable(true)
                .shadow(false)
                .center()
                .build()?;
            Ok(())
        })
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
        .run(tauri::generate_context!());

    if let Err(e) = result {
        write_crash_log(&format!("error while running tauri application: {e}"));
        std::process::exit(1);
    }
}
