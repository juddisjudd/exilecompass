// Text-to-speech output for voice-command replies (e.g. "compass, first
// skill" answering back with the gem name). Two paths:
//
// - Windows SAPI (`tts_speak_sapi`): free, zero-setup default. Shells out to
//   PowerShell's System.Speech synthesizer, same pattern already used by
//   `detect_log_from_process_windows` in lib.rs. Windows-only — there's no
//   equivalent built into this codebase for Linux, so the frontend should
//   treat TTS as unavailable there unless an ElevenLabs key is configured.
// - ElevenLabs (`tts_speak_elevenlabs`): bring-your-own-key. Returns raw MP3
//   bytes to the frontend, which plays them via a normal <audio>/Blob — no
//   Rust-side audio output crate needed, this just reuses the webview.
//
// Both run `async` and do their blocking work via spawn_blocking/reqwest's
// async client, so a multi-second SAPI utterance or a slow network response
// can't freeze the overlay UI thread.

#[tauri::command]
pub async fn tts_speak_sapi(text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || speak_sapi_blocking(&text))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn speak_sapi_blocking(text: &str) -> Result<(), String> {
    // Single-quoted PowerShell string literal — the only escape needed is
    // doubling embedded single quotes.
    let escaped = text.replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Speech; \
         $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         $s.Speak('{escaped}')"
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn speak_sapi_blocking(_text: &str) -> Result<(), String> {
    Err("Built-in text-to-speech is only available on Windows".to_string())
}

/// Synthesize `text` via the caller's own ElevenLabs account and return the
/// raw MP3 bytes. `voice_id` is whichever ElevenLabs voice the user picked in
/// Settings; `api_key` is never persisted on the Rust side — the frontend
/// holds it (see voice.svelte.ts) and passes it through per call.
#[tauri::command]
pub async fn tts_speak_elevenlabs(
    text: String,
    api_key: String,
    voice_id: String,
) -> Result<Vec<u8>, String> {
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");
    let client = reqwest::Client::builder()
        .user_agent("ExileCompass")
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_multilingual_v2",
    });
    let response = client
        .post(&url)
        .header("xi-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error contacting ElevenLabs: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs returned HTTP {status}: {detail}"));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

// ── ElevenLabs API key storage (OS keychain) ─────────────────────────────────
//
// Windows Credential Manager / Linux Secret Service via the `keyring` crate.
// Always available on Windows; on Linux it needs a running keyring daemon
// (GNOME Keyring, KWallet — present by default on most mainstream desktop
// distros, but not guaranteed, e.g. minimal window managers or headless
// setups). When it's not reachable these commands return an error and the
// frontend falls back to the same local settings.json store everything else
// uses (see voice.svelte.ts) — clearly flagged in the UI as not
// keychain-backed, rather than silently pretending it's equally secure.

const KEYCHAIN_SERVICE: &str = "exilecompass-elevenlabs";
const KEYCHAIN_ACCOUNT: &str = "api-key";

fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tts_set_elevenlabs_key_keychain(key: String) -> Result<(), String> {
    keychain_entry()?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tts_get_elevenlabs_key_keychain() -> Result<Option<String>, String> {
    match keychain_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn tts_delete_elevenlabs_key_keychain() -> Result<(), String> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
