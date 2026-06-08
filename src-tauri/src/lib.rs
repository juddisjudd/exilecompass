use std::collections::HashMap;
use std::sync::Mutex;

use overlay_core::{find_poe2_window, focus_window, is_window_alive, KeyChord, WindowInfo};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

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

// ── Window bounds restore ─────────────────────────────────────────────────────
//
// The overlay window position/size is saved by the frontend (debounced) under
// this key in settings.json. We restore it here in Rust, before the window is
// shown, so there's no visible jump from the centered default to the saved spot.

const WINDOW_BOUNDS_KEY: &str = "EXILECOMPASS_WINDOW_BOUNDS_V1";

#[derive(serde::Deserialize)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// Apply the last saved window bounds, if any look sane and land on a monitor.
/// Silently leaves the window centered (its build default) when there's nothing
/// valid to restore — e.g. first run, or a saved spot that's now fully off-screen
/// because a monitor was unplugged.
fn restore_window_bounds(app: &AppHandle, window: &WebviewWindow) {
    let Some(raw) = read_settings(app).remove(WINDOW_BOUNDS_KEY) else {
        return;
    };
    let Ok(b) = serde_json::from_str::<WindowBounds>(&raw) else {
        return;
    };
    // Reject degenerate sizes (a collapsed/zeroed save would lose the window).
    if b.width < 200 || b.height < 200 {
        return;
    }

    // Only restore the position if the window would be at least partially visible
    // on some connected monitor; otherwise keep the centered default.
    let on_monitor = window
        .available_monitors()
        .map(|monitors| {
            monitors.iter().any(|m| {
                let pos = m.position();
                let size = m.size();
                let (mx, my) = (pos.x, pos.y);
                let (mw, mh) = (size.width as i32, size.height as i32);
                let (bw, bh) = (b.width as i32, b.height as i32);
                // Axis-aligned overlap between the saved rect and this monitor.
                b.x < mx + mw && b.x + bw > mx && b.y < my + mh && b.y + bh > my
            })
        })
        .unwrap_or(false);

    let _ = window.set_size(tauri::PhysicalSize::new(b.width, b.height));
    if on_monitor {
        let _ = window.set_position(tauri::PhysicalPosition::new(b.x, b.y));
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

// ── Build folder library ──────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct BuildFileEntry {
    name: String,
    path: String,
    /// Last-modified time in milliseconds since the Unix epoch (for sorting).
    modified: u64,
}

/// List the `.build` files in a folder (e.g. the GGG BuildPlanner directory),
/// newest first. Used by the Build tab's build-library picker.
#[tauri::command]
fn list_build_files(dir: String) -> Result<Vec<BuildFileEntry>, String> {
    use std::time::UNIX_EPOCH;

    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut builds = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // `.build` only, case-insensitive.
        let is_build = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("build"))
            .unwrap_or(false);
        if !is_build {
            continue;
        }

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let modified = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        builds.push(BuildFileEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            modified,
        });
    }

    builds.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(builds)
}

/// Return the default GGG BuildPlanner folder
/// (`<Documents>/My Games/Path of Exile 2/BuildPlanner`) if it exists.
#[tauri::command]
fn detect_build_folder(app: AppHandle) -> Option<String> {
    let docs = app.path().document_dir().ok()?;
    let folder = docs
        .join("My Games")
        .join("Path of Exile 2")
        .join("BuildPlanner");
    if folder.is_dir() {
        Some(folder.to_string_lossy().into_owned())
    } else {
        None
    }
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
    // Auto-hide triggers only fire while this window is foreground.
    overlay_core::set_hook_foreground_target(info.hwnd);
    Ok(info)
}

/// Detach the overlay from the game window (stop tracking it).
#[tauri::command]
fn detach_from_game(state: State<'_, OverlayState>) {
    *state.game_hwnd.lock().unwrap() = None;
    // No game tracked → disable triggers so stray keypresses can't hide the overlay.
    overlay_core::set_hook_foreground_target(0);
}

// ── Auto-hide triggers ────────────────────────────────────────────────────────

/// A trigger chord sent from the frontend (key already resolved to a Windows VK).
#[derive(serde::Deserialize)]
struct TriggerChord {
    vk: u32,
    ctrl: bool,
    shift: bool,
    alt: bool,
}

/// Replace the set of game keybinds that auto-hide the overlay. The low-level
/// keyboard hook observes these without consuming the keystroke.
#[tauri::command]
fn set_overlay_triggers(chords: Vec<TriggerChord>) {
    let chords = chords
        .into_iter()
        .map(|c| KeyChord {
            vk: c.vk,
            ctrl: c.ctrl,
            shift: c.shift,
            alt: c.alt,
        })
        .collect();
    overlay_core::set_trigger_chords(chords);
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
        // Only Windows can enumerate and attach to the PoE2 window. Elsewhere the
        // overlay runs standalone: the frontend skips the "waiting for game" gate
        // and the auto-attach polling, showing the tools immediately.
        "standalone": cfg!(not(target_os = "windows")),
        // Whether the window was created transparent. When false (Linux default),
        // the frontend fills the backdrop opaque + squares the corners so the area
        // outside the rounded shell doesn't show the webview's white surface.
        "transparent": want_transparent(),
    })
}

/// Show and focus the main window once the frontend has painted its first frame.
#[tauri::command]
fn window_show_main(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
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

/// Whether to force Mesa software rendering (`LIBGL_ALWAYS_SOFTWARE=1`).
///
/// This is OFF by default. Forcing llvmpipe was found to *cause* blank/white
/// windows on some stacks (notably when combined with disabled compositing),
/// and our known-good sibling project never forces it. Leave the GL stack alone
/// and only opt in when a user explicitly sets `EXILECOMPASS_SOFTWARE_RENDER=1`.
#[cfg(target_os = "linux")]
fn want_software_render() -> bool {
    std::env::var_os("EXILECOMPASS_SOFTWARE_RENDER").is_some()
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // NOTE: This mirrors the minimal WebKitGTK recipe used by our known-good
        // sibling Tauri app. Earlier, heavier workarounds here (forcing
        // GDK_BACKEND=x11,wayland and LIBGL_ALWAYS_SOFTWARE=1) were themselves a
        // cause of blank/white windows — especially inside VMs — so they are gone.
        // Each remaining flag respects an explicit user override.

        // WebKitGTK ≥2.40 defaults to a DMA-BUF EGL renderer that aborts with
        // "Could not create default EGL display: EGL_BAD_PARAMETER" on many Linux
        // GPU/driver/compositor combos. Disable it before GTK initializes.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // Disabling GPU compositing covers the remaining blank-window reports the
        // DMA-BUF flag alone doesn't. Skip it only when the user is opting into a
        // transparent overlay (which needs compositing) without software render.
        if (!want_transparent() || want_software_render())
            && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
        {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }

        // Software rendering is OFF unless explicitly requested. See
        // want_software_render() for why forcing it by default was harmful.
        if want_software_render() {
            std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
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
            let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("ExileCompass")
                .inner_size(553.0, 680.0)
                .min_inner_size(328.0, 420.0)
                // Start hidden on Linux so we can reveal after the first frontend
                // paint (avoids white/blank first frame on some WebKitGTK stacks).
                .visible(!cfg!(target_os = "linux"))
                .decorations(false)
                .transparent(want_transparent())
                .always_on_top(true)
                .resizable(true)
                .shadow(false)
                .center()
                .build()?;

            // Restore the last saved position/size over the centered default,
            // before the window paints, so there's no visible jump.
            restore_window_bounds(&app.handle(), &window);

            #[cfg(target_os = "linux")]
            {
                // Show immediately rather than waiting for the frontend's
                // window_show_main signal. A WebKitGTK webview built in a hidden
                // window can have its render loop throttled so requestAnimationFrame
                // never fires (see tauri-apps/tauri#11856) — the reveal signal then
                // never arrives and the window is stuck blank. Our known-good
                // sibling app shows immediately on Linux for exactly this reason and
                // accepts a brief startup flash. The frontend's later
                // window_show_main call is harmless (show() is idempotent).
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Install the global keyboard hook for auto-hide triggers. It emits
            // an event the frontend listens for; it never consumes the keystroke.
            let handle = app.handle().clone();
            overlay_core::start_keyboard_hook(move || {
                let _ = handle.emit("overlay-trigger", ());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            find_game_window,
            attach_to_game,
            detach_from_game,
            set_click_through,
            set_overlay_triggers,
            focus_game,
            get_overlay_status,
            detect_log_file,
            read_log_tail,
            read_text_file,
            list_build_files,
            detect_build_folder,
            fetch_pobb_code,
            window_show_main,
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
