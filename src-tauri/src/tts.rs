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

use cpal::traits::{DeviceTrait, HostTrait};

// ── Output device selection ──────────────────────────────────────────────────
//
// Playback goes through rodio on a cpal output device so the user can route
// replies to a headset while game audio stays on speakers. Both TTS backends
// feed this: ElevenLabs hands back MP3 bytes, SAPI is asked to render to a
// WAV file instead of speaking directly. With no device chosen, ElevenLabs
// still plays through the webview's <audio> (proven path) and SAPI speaks
// directly — this code only runs for an explicit device.

#[tauri::command]
pub fn tts_list_output_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.output_devices().map_err(|e| e.to_string())?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

fn resolve_output_device(name: &Option<String>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(wanted) = name {
        if let Ok(mut devices) = host.output_devices() {
            if let Some(d) = devices.find(|d| d.name().map(|n| n == *wanted).unwrap_or(false)) {
                return Ok(d);
            }
        }
    }
    host.default_output_device().ok_or_else(|| "No audio output device found".to_string())
}

fn play_bytes_blocking(bytes: Vec<u8>, device_name: &Option<String>) -> Result<(), String> {
    let device = resolve_output_device(device_name)?;
    let (_stream, handle) = rodio::OutputStream::try_from_device(&device).map_err(|e| e.to_string())?;
    let sink = rodio::Sink::try_new(&handle).map_err(|e| e.to_string())?;
    let source = rodio::Decoder::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    sink.append(source);
    sink.sleep_until_end();
    Ok(())
}

/// Play encoded audio (MP3/WAV) on `device_name`, or the default device.
#[tauri::command]
pub async fn tts_play_audio(bytes: Vec<u8>, device_name: Option<String>) -> Result<(), String> {
    if bytes.is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || play_bytes_blocking(bytes, &device_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tts_speak_sapi(text: String, device_name: Option<String>) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || speak_sapi_blocking(&text, &device_name))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn run_sapi_script(script: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // Prevents the console window PowerShell would otherwise briefly flash
    // open — this fires on every TTS reply.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn speak_sapi_blocking(text: &str, device_name: &Option<String>) -> Result<(), String> {
    // Single-quoted PowerShell string literal — the only escape needed is
    // doubling embedded single quotes.
    let escaped = text.replace('\'', "''");

    let Some(_) = device_name else {
        return run_sapi_script(&format!(
            "Add-Type -AssemblyName System.Speech; \
             $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
             $s.Speak('{escaped}')"
        ));
    };

    let wav = std::env::temp_dir().join(format!("exilecompass-tts-{}.wav", std::process::id()));
    let wav_str = wav.to_string_lossy().replace('\'', "''");
    let result = run_sapi_script(&format!(
        "Add-Type -AssemblyName System.Speech; \
         $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
         $s.SetOutputToWaveFile('{wav_str}'); \
         $s.Speak('{escaped}'); \
         $s.Dispose()"
    ))
    .and_then(|_| std::fs::read(&wav).map_err(|e| e.to_string()))
    .and_then(|bytes| play_bytes_blocking(bytes, device_name));
    let _ = std::fs::remove_file(&wav);
    result
}

/// Linux/macOS: use whichever system engine is installed, preferring ones
/// that can render to WAV so playback goes through the chosen output device
/// like SAPI does. espeak-ng ships with speech-dispatcher on most desktops;
/// pico2wave is the better-sounding but less common SVOX voice. `spd-say`
/// is the last resort and can only speak on the default device.
#[cfg(not(target_os = "windows"))]
fn speak_sapi_blocking(text: &str, device_name: &Option<String>) -> Result<(), String> {
    use std::process::Command;

    let wav = std::env::temp_dir().join(format!("exilecompass-tts-{}.wav", std::process::id()));
    let wav_s = wav.to_string_lossy().into_owned();
    let renderers: [(&str, Vec<&str>); 3] = [
        ("espeak-ng", vec!["-w", &wav_s, text]),
        ("espeak", vec!["-w", &wav_s, text]),
        ("pico2wave", vec!["-w", &wav_s, text]),
    ];
    for (bin, args) in renderers.iter() {
        let rendered = matches!(Command::new(bin).args(args).output(), Ok(out) if out.status.success());
        if !rendered {
            continue;
        }
        let bytes = std::fs::read(&wav).map_err(|e| e.to_string());
        let _ = std::fs::remove_file(&wav);
        return play_bytes_blocking(bytes?, device_name);
    }

    if let Ok(out) = Command::new("spd-say").args(["-w", text]).output() {
        if out.status.success() {
            return Ok(());
        }
    }

    Err("No system text-to-speech engine found. Install espeak-ng (or speech-dispatcher), or add an ElevenLabs key in Settings.".to_string())
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

/// One voice as returned by tts_list_elevenlabs_voices. The plan-related
/// fields are passed through as-is so the frontend can label which voices a
/// free-tier key can actually synthesize with (see `voiceTier` in
/// tts.svelte.ts) — each is optional because ElevenLabs only populates them
/// for some voice categories.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevenLabsVoice {
    pub voice_id: String,
    pub name: String,
    pub category: Option<String>,
    pub is_owner: Option<bool>,
    pub free_users_allowed: Option<bool>,
    pub available_for_tiers: Vec<String>,
}

/// List voices the caller's own ElevenLabs account can actually use.
///
/// Previously this filtered `GET /v2/voices` by `voice_type=default,personal`
/// on the theory that would scope the result to guaranteed-usable voices —
/// that came back empty even for an account with plenty of working premade
/// voices (Adam, Sarah, etc.), and the error was silently swallowed (see the
/// old `continue` on a non-success status below) so there was no way to tell
/// why. Simplified to the plain, unfiltered `GET /v1/voices` — the
/// long-standing baseline "list my available voices" call every ElevenLabs
/// SDK/tutorial uses — and a real HTTP failure now actually surfaces instead
/// of being swallowed. (The free-tier restriction that's real: the *Voice
/// Library* — ElevenLabs' community/marketplace voice browser — isn't
/// reachable via the API on a free plan at all. Premade/default voices and
/// anything already in the account's own collection aren't part of that
/// restriction, which is what this call returns.)
#[tauri::command]
pub async fn tts_list_elevenlabs_voices(api_key: String) -> Result<Vec<ElevenLabsVoice>, String> {
    let client = reqwest::Client::builder()
        .user_agent("ExileCompass")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("Network error contacting ElevenLabs: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs returned HTTP {status}: {detail}"));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let entries = body
        .get("voices")
        .and_then(|v| v.as_array())
        .ok_or("ElevenLabs response didn't include a voices list")?;

    let voices: Vec<ElevenLabsVoice> = entries
        .iter()
        .filter_map(|entry| {
            let voice_id = entry.get("voice_id").and_then(|v| v.as_str())?;
            let name = entry.get("name").and_then(|v| v.as_str())?;
            let str_field = |k: &str| entry.get(k).and_then(|v| v.as_str()).map(str::to_string);
            let available_for_tiers = entry
                .get("available_for_tiers")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|t| t.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            Some(ElevenLabsVoice {
                voice_id: voice_id.to_string(),
                name: name.to_string(),
                category: str_field("category"),
                is_owner: entry.get("is_owner").and_then(|v| v.as_bool()),
                free_users_allowed: entry
                    .get("sharing")
                    .and_then(|s| s.get("free_users_allowed"))
                    .and_then(|v| v.as_bool()),
                available_for_tiers,
            })
        })
        .collect();
    if voices.is_empty() {
        return Err("ElevenLabs returned no voices for this account".to_string());
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
