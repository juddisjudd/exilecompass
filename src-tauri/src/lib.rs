use std::collections::HashMap;
use std::sync::Mutex;

use overlay_core::{
    find_poe1_window, find_poe2_window, focus_window, is_window_alive, KeyChord, WindowInfo,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

/// Resolve the game-specific window finder for a `game` id ("poe1" | "poe2").
/// Unrecognized ids fall back to PoE2 (the app's original/default game).
fn find_window_for_game(game: &str) -> Option<WindowInfo> {
    match game {
        "poe1" => find_poe1_window(),
        _ => find_poe2_window(),
    }
}

fn game_display_name(game: &str) -> &'static str {
    match game {
        "poe1" => "Path of Exile",
        _ => "Path of Exile 2",
    }
}

struct OverlayState {
    game_hwnd: Mutex<Option<isize>>,
    click_through: Mutex<bool>,
    /// Which game the overlay currently targets: "poe1" or "poe2".
    active_game: Mutex<String>,
}

impl OverlayState {
    fn new() -> Self {
        Self {
            game_hwnd: Mutex::new(None),
            click_through: Mutex::new(false),
            active_game: Mutex::new("poe2".to_string()),
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

/// Whether the in-app updater can self-update this install. Tauri's Linux
/// updater only supports AppImage (it replaces the running AppImage file in
/// place, located via the `APPIMAGE` env var). `.deb` / AUR / other system
/// installs must update through their package manager, so we surface manual
/// update guidance for those instead of an Install button that would fail.
#[tauri::command]
fn update_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("APPIMAGE").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
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

const ADDONS_STATE_KEY: &str = "EXILECOMPASS_ADDONS_STATE_V1";

/// Fixed release-asset filename the addon build pipeline uploads, so installs
/// can construct the download URL without querying the GitHub API.
const ADDON_PACKAGE_ASSET: &str = "exilecompass-addon.zip";

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AddonRecord {
    id: String,
    name: String,
    version: String,
    enabled: bool,
    trust: String,
    source: String,
    permissions: Vec<String>,
    has_update: bool,
    update_version: Option<String>,
    last_error: Option<String>,
    /// Whether the addon contributes a panel (has `entry.panel`).
    #[serde(default)]
    has_panel: bool,
    /// When pinned, the host promotes the panel to a top-level tab.
    #[serde(default)]
    pinned: bool,
    /// Short label for the panel tab (from `contributions.view.panels[].title`).
    #[serde(default)]
    panel_title: Option<String>,
}

#[derive(serde::Deserialize)]
struct AddonManifestEntry {
    main: Option<String>,
    panel: Option<String>,
    data: Option<String>,
}

#[derive(serde::Deserialize)]
struct AddonManifest {
    id: String,
    name: String,
    version: String,
    homepage: Option<String>,
    #[serde(alias = "repoUrl")]
    repo_url: Option<String>,
    entry: Option<AddonManifestEntry>,
    permissions: Option<Vec<String>>,
    contributions: Option<serde_json::Value>,
}

/// Pull the first declared panel's `title` and `pinDefault` out of a manifest's
/// `contributions.view.panels`, if any.
fn manifest_panel_meta(manifest: &AddonManifest) -> (Option<String>, bool) {
    let panel = manifest
        .contributions
        .as_ref()
        .and_then(|c| c.get("view"))
        .and_then(|v| v.get("panels"))
        .and_then(|p| p.as_array())
        .and_then(|a| a.first());
    let title = panel
        .and_then(|p| p.get("title"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let pin_default = panel
        .and_then(|p| p.get("pinDefault"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    (title, pin_default)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistryAddon {
    id: String,
    name: String,
    author: String,
    repo_url: String,
    description: String,
    latest_version: String,
    trust: String,
    compatible: bool,
}

fn read_addons(app: &AppHandle) -> Vec<AddonRecord> {
    read_settings(app)
        .get(ADDONS_STATE_KEY)
        .and_then(|s| serde_json::from_str::<Vec<AddonRecord>>(s).ok())
        .unwrap_or_default()
}

fn write_addons(app: &AppHandle, addons: &[AddonRecord]) -> Result<(), String> {
    let mut map = read_settings(app);
    map.insert(
        ADDONS_STATE_KEY.to_string(),
        serde_json::to_string(addons).map_err(|e| e.to_string())?,
    );
    write_settings(app, &map)
}

fn registry_url_candidates() -> Vec<String> {
    let mut out = Vec::new();

    if let Ok(explicit) = std::env::var("EXILECOMPASS_REGISTRY_URL") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            out.push(trimmed.to_string());
        }
    }

    out.push("https://registry.exilecompass.com/registry.v1.json".to_string());
    out
}

fn is_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

fn fetch_registry_from_url(url: &str) -> Result<String, String> {
    let target = url.to_string();
    tauri::async_runtime::block_on(async move {
        let response = reqwest::get(&target).await.map_err(|e| e.to_string())?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("Registry request failed ({status}) for {target}"));
        }
        response.text().await.map_err(|e| e.to_string())
    })
}

fn parse_registry_addons(raw: &str) -> Result<Vec<RegistryAddon>, String> {
    let json: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;

    // Supported shape A:
    // { "addons": [{ id, name, description, latestVersion, trust, compatible }] }
    if let Some(items) = json.get("addons").and_then(|v| v.as_array()) {
        let mapped = items
            .iter()
            .filter_map(|item| {
                Some(RegistryAddon {
                    id: item.get("id")?.as_str()?.to_string(),
                    name: item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unnamed addon")
                        .to_string(),
                    author: item
                        .get("author")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown author")
                        .to_string(),
                    repo_url: item
                        .get("repoUrl")
                        .or_else(|| item.get("repo_url"))
                        .or_else(|| item.get("homepage"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    description: item
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    latest_version: item
                        .get("latestVersion")
                        .or_else(|| item.get("latest_version"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0.0")
                        .to_string(),
                    trust: item
                        .get("trust")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unverified")
                        .to_string(),
                    compatible: item
                        .get("compatible")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                })
            })
            .collect();
        return Ok(mapped);
    }

    // Supported shape B (registry spec draft):
    // { "packages": [{ id, latest, versions: [{ version }] }] }
    if let Some(packages) = json.get("packages").and_then(|v| v.as_array()) {
        let mapped = packages
            .iter()
            .filter_map(|pkg| {
                let id = pkg.get("id")?.as_str()?.to_string();
                let latest = pkg
                    .get("latest")
                    .and_then(|v| v.as_str())
                    .or_else(|| {
                        pkg.get("versions")
                            .and_then(|v| v.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|v| v.get("version"))
                            .and_then(|v| v.as_str())
                    })
                    .unwrap_or("0.0.0")
                    .to_string();

                Some(RegistryAddon {
                    name: id.clone(),
                    id,
                    author: "Unknown author".to_string(),
                    repo_url: "".to_string(),
                    description: "From registry package index".to_string(),
                    latest_version: latest,
                    trust: "verified".to_string(),
                    compatible: true,
                })
            })
            .collect();
        return Ok(mapped);
    }

    Err("Unsupported registry format".to_string())
}

fn resolve_manifest_entry_path(
    addon_root: &std::path::Path,
    value: &str,
    field_name: &str,
) -> Result<std::path::PathBuf, String> {
    if !value.starts_with("./") {
        return Err(format!("{field_name} must start with './'"));
    }
    let candidate = addon_root.join(&value[2..]);
    if !candidate.exists() {
        return Err(format!("{field_name} points to a missing file: {value}"));
    }
    Ok(candidate)
}

/// Validate a *built* addon package as it sits on disk after install: the
/// manifest plus a `dist/` directory of bundled, browser-runnable JS. Authors
/// write TypeScript; the release pipeline bundles it to `./dist/*.js`, so we
/// never validate or run `src/` here.
fn validate_addon_layout(
    manifest_path: &std::path::Path,
    manifest: &AddonManifest,
) -> Result<(), String> {
    let manifest_name = manifest_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if manifest_name != "plugin.manifest.json" {
        return Err("Manifest filename must be plugin.manifest.json".to_string());
    }

    let addon_root = manifest_path
        .parent()
        .ok_or("Manifest path must include a parent directory")?;

    if !addon_root.join("README.md").is_file() {
        return Err("Package must include README.md".to_string());
    }
    if !addon_root.join("dist").is_dir() {
        return Err("Package must include a built dist directory".to_string());
    }

    let entry = manifest
        .entry
        .as_ref()
        .ok_or("Manifest must include an entry object")?;

    // A package must expose at least one runnable bundle (panel and/or main).
    let runnable = [entry.main.as_deref(), entry.panel.as_deref()];
    if runnable.iter().all(|v| v.is_none()) {
        return Err("Manifest entry must declare a panel or main bundle".to_string());
    }

    for (field, value) in [("entry.main", entry.main.as_deref()), ("entry.panel", entry.panel.as_deref())] {
        let Some(value) = value else { continue };
        if !value.starts_with("./dist/") {
            return Err(format!("{field} must be a bundled file inside ./dist/"));
        }
        if !(value.ends_with(".js") || value.ends_with(".mjs")) {
            return Err(format!("{field} must target a bundled .js/.mjs file"));
        }
        let _ = resolve_manifest_entry_path(addon_root, value, field)?;
    }

    if let Some(data) = entry.data.as_deref() {
        if !data.starts_with("./data/") {
            return Err("entry.data must be inside ./data/".to_string());
        }
        let _ = resolve_manifest_entry_path(addon_root, data, "entry.data")?;
    }

    Ok(())
}

#[tauri::command]
fn addons_list(app: AppHandle) -> Vec<AddonRecord> {
    read_addons(&app)
}

#[tauri::command]
fn addons_set_enabled(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let mut addons = read_addons(&app);
    if let Some(addon) = addons.iter_mut().find(|a| a.id == id) {
        addon.enabled = enabled;
        return write_addons(&app, &addons);
    }
    Err("Addon not found".to_string())
}

#[tauri::command]
fn addons_set_pinned(app: AppHandle, id: String, pinned: bool) -> Result<(), String> {
    let mut addons = read_addons(&app);
    if let Some(addon) = addons.iter_mut().find(|a| a.id == id) {
        addon.pinned = pinned;
        return write_addons(&app, &addons);
    }
    Err("Addon not found".to_string())
}

#[tauri::command]
fn addons_uninstall(app: AppHandle, id: String) -> Result<(), String> {
    let mut addons = read_addons(&app);
    let before = addons.len();
    addons.retain(|a| a.id != id);
    if addons.len() == before {
        return Err("Addon not found".to_string());
    }
    write_addons(&app, &addons)
}

#[tauri::command]
fn addons_install_from_manifest(
    app: AppHandle,
    path: String,
    source: Option<String>,
) -> Result<AddonRecord, String> {
    let manifest_path = std::path::PathBuf::from(&path);
    let source = source.unwrap_or_else(|| "manual".to_string());
    install_record_from_manifest(&app, &manifest_path, &source, None)
}

/// Validate the addon package rooted at `manifest_path`, build its record and
/// persist it. Shared by manual (local path) and registry (downloaded) installs.
/// `trust_override` lets the registry index dictate the trust level; otherwise
/// it's derived from the install source.
fn install_record_from_manifest(
    app: &AppHandle,
    manifest_path: &std::path::Path,
    source: &str,
    trust_override: Option<&str>,
) -> Result<AddonRecord, String> {
    let raw = std::fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let manifest: AddonManifest = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let has_repo_link = manifest
        .homepage
        .as_deref()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
        || manifest
            .repo_url
            .as_deref()
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false);
    if !has_repo_link {
        return Err("Addon manifest must include a repository/homepage link (homepage or repoUrl)".to_string());
    }

    validate_addon_layout(manifest_path, &manifest)?;

    let has_panel = manifest
        .entry
        .as_ref()
        .and_then(|e| e.panel.as_ref())
        .is_some();
    let (panel_title, pin_default) = manifest_panel_meta(&manifest);

    let mut addons = read_addons(app);
    // On re-install/update, keep the user's current pin choice; otherwise seed
    // it from the manifest's pinDefault.
    let pinned = addons
        .iter()
        .find(|a| a.id == manifest.id)
        .map(|existing| existing.pinned)
        .unwrap_or(pin_default);

    let record = AddonRecord {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        enabled: true,
        trust: trust_override
            .map(|t| t.to_string())
            .unwrap_or_else(|| if source == "registry" { "verified" } else { "unverified" }.to_string()),
        source: source.to_string(),
        permissions: manifest.permissions.unwrap_or_default(),
        has_update: false,
        update_version: None,
        last_error: None,
        has_panel,
        pinned,
        panel_title,
    };

    if let Some(existing) = addons.iter_mut().find(|a| a.id == record.id) {
        *existing = record.clone();
    } else {
        addons.push(record.clone());
    }

    write_addons(app, &addons)?;
    Ok(record)
}

/// Where downloaded addon packages are extracted: `<app_data>/addons/<id>/`.
fn addons_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("addons");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Keep an addon id safe to use as a single directory name (no traversal,
/// no separators). Ids come from the remote registry, so never trust them:
/// reject anything that would resolve to the parent (`.`, `..`, all-dots) or
/// is empty after sanitizing.
fn sanitize_id(id: &str) -> Result<String, String> {
    let cleaned: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .collect();
    if cleaned.is_empty() || cleaned.chars().all(|c| c == '.') {
        return Err(format!("Invalid addon id: {id}"));
    }
    Ok(cleaned)
}

/// Pull `(owner, repo)` out of a GitHub URL like
/// `https://github.com/owner/repo` (trailing `/` or `.git` tolerated).
fn parse_github_owner_repo(url: &str) -> Option<(String, String)> {
    let rest = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))?;
    let rest = rest.trim_end_matches('/');
    let mut parts = rest.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

/// Download `url` as bytes. GitHub serves archive zips via a redirect to
/// codeload, which reqwest follows by default; a User-Agent avoids the
/// occasional 403 from GitHub's edge.
fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let target = url.to_string();
    tauri::async_runtime::block_on(async move {
        let client = reqwest::Client::builder()
            .user_agent("ExileCompass")
            .build()
            .map_err(|e| e.to_string())?;
        let response = client.get(&target).send().await.map_err(|e| e.to_string())?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("HTTP {status} for {target}"));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    })
}

/// Extract an addon package zip into `dest`. The release pipeline builds a flat
/// package (manifest + dist/ + data/ at the zip root), so entries map straight
/// to `dest`. `enclosed_name` guards against zip-slip path traversal.
fn extract_zip(zip_bytes: &[u8], dest: &std::path::Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else {
            continue;
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out_path = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn addons_install_from_registry(app: AppHandle, id: String) -> Result<AddonRecord, String> {
    let entry = resolve_registry_addons(None)?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("Addon {id} not found in registry"))?;

    if !entry.compatible {
        return Err(format!("Addon {id} is not compatible with this app version"));
    }

    let (owner, repo) = parse_github_owner_repo(&entry.repo_url)
        .ok_or_else(|| format!("Addon {id} has no installable GitHub repoUrl"))?;

    // The release workflow uploads the built package under a fixed asset name,
    // so the download URL is predictable — no GitHub API call (or rate limit).
    // GitHub tags are usually `vX.Y.Z`, but accept a bare `X.Y.Z` too.
    let ver = entry.latest_version.trim_start_matches('v');
    let tag_candidates = [format!("v{ver}"), ver.to_string()];

    let mut zip_bytes = None;
    let mut last_err = String::from("no release asset matched");
    for tag in &tag_candidates {
        let url = format!(
            "https://github.com/{owner}/{repo}/releases/download/{tag}/{ADDON_PACKAGE_ASSET}"
        );
        match http_get_bytes(&url) {
            Ok(bytes) => {
                zip_bytes = Some(bytes);
                break;
            }
            Err(e) => last_err = e,
        }
    }
    let zip_bytes = zip_bytes.ok_or_else(|| {
        format!("Failed to download {ADDON_PACKAGE_ASSET} for {owner}/{repo}@{ver}: {last_err}")
    })?;

    let root = addons_dir(&app)?;
    let dest = root.join(sanitize_id(&id)?);
    // Defense in depth: dest must be a direct child of the addons dir before we
    // ever remove_dir_all it, so a crafted id can never escape upward.
    if dest.parent() != Some(root.as_path()) {
        return Err(format!("Refusing to install addon with unsafe id: {id}"));
    }
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    extract_zip(&zip_bytes, &dest)?;

    let manifest_path = dest.join("plugin.manifest.json");
    if !manifest_path.is_file() {
        return Err("Downloaded package is missing plugin.manifest.json at its root".to_string());
    }

    install_record_from_manifest(&app, &manifest_path, "registry", Some(&entry.trust))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AddonPanelPayload {
    /// The addon's bundled panel JS (a single ESM module exporting `mount`).
    code: String,
    title: String,
}

/// Read an installed addon's bundled panel module so the host can run it inside
/// a sandboxed iframe. Resolves `entry.panel` from the on-disk manifest, keeps
/// the path inside the addon directory, and returns the JS text.
#[tauri::command]
fn addons_read_panel(app: AppHandle, id: String) -> Result<AddonPanelPayload, String> {
    let addon_root = addons_dir(&app)?.join(sanitize_id(&id)?);
    let manifest_path = addon_root.join("plugin.manifest.json");
    let raw = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let panel_rel = manifest
        .get("entry")
        .and_then(|e| e.get("panel"))
        .and_then(|v| v.as_str())
        .ok_or("This add-on does not provide a panel")?;
    if !panel_rel.starts_with("./") {
        return Err("entry.panel must be a relative './' path".to_string());
    }
    let panel_path = addon_root.join(&panel_rel[2..]);

    // Resolve symlinks/.. and confirm the file is still inside the addon dir.
    let canon_root = addon_root.canonicalize().map_err(|e| e.to_string())?;
    let canon_panel = panel_path.canonicalize().map_err(|e| e.to_string())?;
    if !canon_panel.starts_with(&canon_root) {
        return Err("entry.panel escapes the addon directory".to_string());
    }

    let code = std::fs::read_to_string(&canon_panel).map_err(|e| e.to_string())?;

    let title = manifest
        .get("contributions")
        .and_then(|c| c.get("view"))
        .and_then(|v| v.get("panels"))
        .and_then(|p| p.as_array())
        .and_then(|a| a.first())
        .and_then(|p| p.get("title"))
        .and_then(|v| v.as_str())
        .or_else(|| manifest.get("name").and_then(|v| v.as_str()))
        .unwrap_or("Add-on")
        .to_string();

    Ok(AddonPanelPayload { code, title })
}

#[tauri::command]
fn addons_load_registry(path: Option<String>) -> Result<Vec<RegistryAddon>, String> {
    resolve_registry_addons(path)
}

fn resolve_registry_addons(path: Option<String>) -> Result<Vec<RegistryAddon>, String> {
    if let Some(p) = path {
        if is_url(&p) {
            let raw = fetch_registry_from_url(&p)?;
            return parse_registry_addons(&raw);
        }

        let explicit_path = std::path::PathBuf::from(&p);
        if explicit_path.exists() {
            let raw = std::fs::read_to_string(explicit_path).map_err(|e| e.to_string())?;
            return parse_registry_addons(&raw);
        }

        return Err(format!("Explicit registry path not found: {p}"));
    }

    let mut last_remote_error = None;
    for url in registry_url_candidates() {
        match fetch_registry_from_url(&url) {
            Ok(raw) => match parse_registry_addons(&raw) {
                Ok(parsed) => return Ok(parsed),
                Err(e) => {
                    last_remote_error = Some(format!("{url}: {e}"));
                }
            },
            Err(e) => {
                last_remote_error = Some(format!("{url}: {e}"));
            }
        }
    }

    if let Some(err) = last_remote_error {
        return Err(format!("Remote registry failed: {err}"));
    }

    Err("No registry URL configured".to_string())
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

/// Try to locate the Client.txt log file automatically for the given game
/// ("poe1" | "poe2"). On Windows, first checks the running process, then
/// falls back to common install paths. On Linux, checks common Steam/Wine paths.
#[tauri::command]
fn detect_log_file(game: String) -> Option<String> {
    #[cfg(target_os = "windows")]
    if let Some(path) = detect_log_from_process_windows(&game) {
        return Some(path);
    }

    for path in candidate_log_paths(&game) {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }
    None
}

/// Ask PowerShell for the executable path of a running PathOfExile process
/// matching `game`, then derive logs/Client.txt from the parent directory.
/// wmic is deprecated and removed in Windows 11 — PowerShell Get-Process is reliable.
/// PoE2's process name starts with "PathOfExile2"; PoE1's doesn't, so filtering
/// PoE1 down to names that *don't* match that prefix disambiguates the two when
/// both happen to be running.
#[cfg(target_os = "windows")]
fn detect_log_from_process_windows(game: &str) -> Option<String> {
    let script = if game == "poe1" {
        "(Get-Process -Name 'PathOfExile*' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike 'PathOfExile2*' } | Select-Object -First 1).Path"
    } else {
        "(Get-Process -Name 'PathOfExile2*' -ErrorAction SilentlyContinue | Select-Object -First 1).Path"
    };

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
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

fn candidate_log_paths(game: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let name = game_display_name(game); // "Path of Exile" | "Path of Exile 2"
    let steam_dir = if game == "poe1" {
        "Path of Exile"
    } else {
        "Path of Exile 2"
    };

    #[cfg(target_os = "windows")]
    {
        for var in &["PROGRAMFILES(X86)", "PROGRAMFILES"] {
            if let Ok(root) = std::env::var(var) {
                paths.push(format!(
                    r"{root}\Grinding Gear Games\{name}\logs\Client.txt"
                ));
                paths.push(format!(
                    r"{root}\Steam\steamapps\common\{steam_dir}\logs\Client.txt"
                ));
            }
        }
        // Hard-coded fallbacks in case env vars are absent
        for base in [
            r"C:\Program Files (x86)",
            r"C:\Program Files",
        ] {
            paths.push(format!(r"{base}\Grinding Gear Games\{name}\logs\Client.txt"));
            paths.push(format!(
                r"{base}\Steam\steamapps\common\{steam_dir}\logs\Client.txt"
            ));
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let data_home = std::env::var("XDG_DATA_HOME")
            .unwrap_or_else(|_| format!("{home}/.local/share"));
        let wine_dir = if game == "poe1" {
            "path-of-exile"
        } else {
            "path-of-exile-2"
        };

        paths.extend([
            format!("{data_home}/Steam/steamapps/common/{steam_dir}/logs/Client.txt"),
            format!("{home}/.steam/steam/steamapps/common/{steam_dir}/logs/Client.txt"),
            format!("{home}/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/{steam_dir}/logs/Client.txt"),
            format!("{home}/Games/{wine_dir}/drive_c/Program Files/Grinding Gear Games/{name}/logs/Client.txt"),
            format!("{home}/.wine/drive_c/Program Files/Grinding Gear Games/{name}/logs/Client.txt"),
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
/// (`<Documents>/My Games/<game>/BuildPlanner`) if it exists.
#[tauri::command]
fn detect_build_folder(app: AppHandle, game: String) -> Option<String> {
    let docs = app.path().document_dir().ok()?;
    let folder = docs
        .join("My Games")
        .join(game_display_name(&game))
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

/// Return the current game window info (for whichever game is active) without attaching.
#[tauri::command]
fn find_game_window(state: State<'_, OverlayState>) -> Option<WindowInfo> {
    find_window_for_game(&state.active_game.lock().unwrap())
}

/// Switch which game the overlay targets ("poe1" | "poe2"). Takes effect on the
/// next attach/status check — does not itself move or detach anything.
#[tauri::command]
fn set_active_game(state: State<'_, OverlayState>, game: String) {
    *state.active_game.lock().unwrap() = game;
}

/// Find and remember the active game's window handle. Does not move or resize the overlay.
#[tauri::command]
fn attach_to_game(state: State<'_, OverlayState>) -> Result<WindowInfo, String> {
    let game = state.active_game.lock().unwrap().clone();
    let info = find_window_for_game(&game)
        .ok_or_else(|| format!("{} window not found", game_display_name(&game)))?;
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

// ── Secondary overlay widget windows ─────────────────────────────────────────
//
// Glanceable HUDs (Act-Decoder, PoB tree overlay, macro wheel, etc.) need to
// float over the game independently of whichever tab is active in the main
// window, and need their own independent click-through state — Tauri's
// `set_ignore_cursor_events` is all-or-nothing per window, so one shared
// overlay window can't do this. Each widget gets its own always-on-top,
// borderless, transparent `WebviewWindow` pointed at the `/widget` route
// (`?widget=<id>` tells the frontend which widget to render); labels must be
// prefixed `widget-` to match the `widget-*` capability.

/// Create (or no-op if already open) a secondary overlay widget window.
/// `label` must be unique per widget instance (prefix `widget-`); `widget` is
/// the id the frontend's `/widget` route reads to pick what to render.
// `async fn` here is load-bearing, not cosmetic: this command is invoked from
// the WebView2 IPC callback, which runs on the main UI thread. A plain `fn`
// command executes inline on that same thread, and `WebviewWindowBuilder::build()`
// needs the main thread's message loop free to pump WebView2's async
// environment setup — calling it while already inside that thread's IPC
// callback deadlocks (window frame appears, content never loads, no
// panic/error). Marking this `async` dispatches it onto Tauri's async runtime
// instead, off the UI thread, so `build()` can complete normally.
#[tauri::command]
async fn create_widget_window(
    app: AppHandle,
    label: String,
    widget: String,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let url = tauri::WebviewUrl::App(format!("widget?widget={widget}").into());
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, url)
        .title("ExileCompass")
        .inner_size(320.0, 260.0)
        .decorations(false)
        .transparent(want_transparent())
        .always_on_top(true)
        .resizable(true)
        .shadow(false)
        .skip_taskbar(true);

    builder = match (x, y) {
        (Some(x), Some(y)) => builder.position(x, y),
        _ => builder.center(),
    };

    builder.build().map_err(|e| e.to_string())?;
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

/// Dev/testing bypass for PoE2 process/window detection.
///
/// Enabled when either:
/// - `EXILECOMPASS_NO_DETECT` environment variable is set (non-empty), or
/// - `--no-detect` appears in app arguments (for `tauri dev -- --no-detect`).
fn no_detect_mode() -> bool {
    std::env::var_os("EXILECOMPASS_NO_DETECT").is_some()
        || std::env::args().any(|arg| arg == "--no-detect")
}

/// Return current overlay status for the frontend.
#[tauri::command]
fn get_overlay_status(state: State<'_, OverlayState>) -> serde_json::Value {
    let hwnd = *state.game_hwnd.lock().unwrap();
    let click_through = *state.click_through.lock().unwrap();
    let game_alive = hwnd.map(is_window_alive).unwrap_or(false);
    let no_detect = no_detect_mode();

    serde_json::json!({
        "attached": hwnd.is_some() && game_alive,
        "clickThrough": click_through,
        // In no-detect mode we force the frontend out of the "waiting for game"
        // gate and skip auto-attach polling, so UI tools can be tested standalone.
        "gameRunning": no_detect || find_window_for_game(&state.active_game.lock().unwrap()).is_some(),
        // Only Windows can enumerate and attach to the PoE2 window. Elsewhere the
        // overlay runs standalone: the frontend skips the "waiting for game" gate
        // and the auto-attach polling, showing the tools immediately.
        "standalone": no_detect || cfg!(not(target_os = "windows")),
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
        // Must be registered before any other plugin: it needs to intercept a
        // second launch before anything else (tray, global shortcuts, etc.)
        // sets up and potentially collides with the first instance's state —
        // e.g. the click-through global hotkey, which a second instance would
        // otherwise fail to register since the first instance still holds it.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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
            set_active_game,
            attach_to_game,
            detach_from_game,
            set_click_through,
            set_overlay_triggers,
            create_widget_window,
            focus_game,
            get_overlay_status,
            detect_log_file,
            read_log_tail,
            read_text_file,
            list_build_files,
            detect_build_folder,
            fetch_pobb_code,
            window_show_main,
            update_supported,
            store_get,
            store_set,
            store_remove,
            addons_list,
            addons_set_enabled,
            addons_set_pinned,
            addons_uninstall,
            addons_install_from_manifest,
            addons_install_from_registry,
            addons_read_panel,
            addons_load_registry,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        write_crash_log(&format!("error while running tauri application: {e}"));
        std::process::exit(1);
    }
}
