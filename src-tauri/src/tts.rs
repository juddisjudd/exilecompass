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
    use std::os::windows::process::CommandExt;
    // Prevents the console window PowerShell would otherwise briefly flash
    // open — this fires on every TTS reply, unlike detect_log_from_process_windows
    // (lib.rs) which only runs once at log-file setup and so never made the
    // flash noticeable enough to matter there.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
        .creation_flags(CREATE_NO_WINDOW)
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

/// One voice as returned by tts_list_elevenlabs_voices.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsVoice {
    pub voice_id: String,
    pub name: String,
}

/// List voices the caller's own ElevenLabs account can actually use.
///
/// Previously the voice picker was a hardcoded list of well-known preset ids
/// (Rachel, Adam, ...) — several of those turn out to be ElevenLabs Voice
/// Library entries gated behind a paid plan (`available_for_tiers` in their
/// API), so a free-tier account hit "402 Payment Required" on some of them
/// with no way to tell which ones would work in advance. `voice_type=default`
/// is ElevenLabs' own baseline voice set, included on every plan including
/// free; `voice_type=personal` adds anything the account has explicitly
/// added/cloned. Both are guaranteed-usable by construction, so there's
/// nothing to gate or predict client-side.
#[tauri::command]
pub async fn tts_list_elevenlabs_voices(api_key: String) -> Result<Vec<ElevenLabsVoice>, String> {
    let client = reqwest::Client::builder()
        .user_agent("ExileCompass")
        .build()
        .map_err(|e| e.to_string())?;

    let mut voices: Vec<ElevenLabsVoice> = Vec::new();
    for voice_type in ["default", "personal"] {
        let url = format!("https://api.elevenlabs.io/v2/voices?voice_type={voice_type}&page_size=100");
        let response = client
            .get(&url)
            .header("xi-api-key", &api_key)
            .send()
            .await
            .map_err(|e| format!("Network error contacting ElevenLabs: {e}"))?;
        if !response.status().is_success() {
            // Don't hard-fail the whole listing over one category (e.g. a
            // fresh account may have zero 'personal' voices, or ElevenLabs
            // could reject an unfamiliar voice_type in the future).
            continue;
        }
        let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let Some(entries) = body.get("voices").and_then(|v| v.as_array()) else {
            continue;
        };
        for entry in entries {
            let (Some(voice_id), Some(name)) = (
                entry.get("voice_id").and_then(|v| v.as_str()),
                entry.get("name").and_then(|v| v.as_str()),
            ) else {
                continue;
            };
            if voices.iter().any(|v| v.voice_id == voice_id) {
                continue; // a voice could conceivably show up in both categories
            }
            voices.push(ElevenLabsVoice { voice_id: voice_id.to_string(), name: name.to_string() });
        }
    }
    if voices.is_empty() {
        return Err("No usable ElevenLabs voices found for this account".to_string());
    }
    Ok(voices)
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
