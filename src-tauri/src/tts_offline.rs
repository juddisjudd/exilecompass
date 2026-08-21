// Offline neural text-to-speech via sherpa-onnx (Piper/VITS and Kokoro
// models from the k2-fsa "tts-models" release). Voices are downloaded on
// demand into <app_data_dir>/tts-voices/<id>/ and synthesized locally; the
// generated samples play through the same cpal output device selection as
// the other TTS backends.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures_util::StreamExt;
use sherpa_onnx::{GenerationConfig, OfflineTts, OfflineTtsConfig};
use tauri::{AppHandle, Emitter, Manager, State};

const RELEASE_BASE: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Vits,
    Kokoro,
}

struct Voice {
    id: &'static str,
    archive: &'static str,
    /// Path of the model file inside the extracted directory.
    model: &'static str,
    kind: Kind,
    name: &'static str,
    description: &'static str,
    size_mb: u32,
    speakers: &'static [&'static str],
}

const VOICES: &[Voice] = &[
    Voice {
        id: "piper-en_US-amy",
        archive: "vits-piper-en_US-amy-medium",
        model: "en_US-amy-medium.onnx",
        kind: Kind::Vits,
        name: "Amy",
        description: "US English, female. Fast and light.",
        size_mb: 64,
        speakers: &[],
    },
    Voice {
        id: "piper-en_US-lessac",
        archive: "vits-piper-en_US-lessac-medium",
        model: "en_US-lessac-medium.onnx",
        kind: Kind::Vits,
        name: "Lessac",
        description: "US English, female. Clear narration voice.",
        size_mb: 64,
        speakers: &[],
    },
    Voice {
        id: "piper-en_US-ryan",
        archive: "vits-piper-en_US-ryan-medium",
        model: "en_US-ryan-medium.onnx",
        kind: Kind::Vits,
        name: "Ryan",
        description: "US English, male.",
        size_mb: 64,
        speakers: &[],
    },
    Voice {
        id: "piper-en_GB-alan",
        archive: "vits-piper-en_GB-alan-medium",
        model: "en_GB-alan-medium.onnx",
        kind: Kind::Vits,
        name: "Alan",
        description: "British English, male.",
        size_mb: 64,
        speakers: &[],
    },
    Voice {
        id: "piper-en_GB-alba",
        archive: "vits-piper-en_GB-alba-medium",
        model: "en_GB-alba-medium.onnx",
        kind: Kind::Vits,
        name: "Alba",
        description: "British English, female.",
        size_mb: 64,
        speakers: &[],
    },
    Voice {
        id: "kokoro-en",
        archive: "kokoro-en-v0_19",
        model: "model.onnx",
        kind: Kind::Kokoro,
        name: "Kokoro",
        description: "Best quality. 11 US and British speakers to choose from.",
        size_mb: 305,
        speakers: &[
            "af", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_adam", "am_michael", "bf_emma",
            "bf_isabella", "bm_george", "bm_lewis",
        ],
    },
];

fn voice(id: &str) -> Result<&'static Voice, String> {
    VOICES.iter().find(|v| v.id == id).ok_or_else(|| format!("Unknown offline voice: {id}"))
}

fn voices_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("tts-voices");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn voice_dir(app: &AppHandle, v: &Voice) -> Result<PathBuf, String> {
    Ok(voices_root(app)?.join(v.id))
}

fn is_installed(dir: &Path, v: &Voice) -> bool {
    dir.join(v.model).is_file() && dir.join("tokens.txt").is_file()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineVoiceInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_mb: u32,
    pub installed: bool,
    pub speakers: Vec<String>,
}

#[tauri::command]
pub fn tts_offline_voices(app: AppHandle) -> Result<Vec<OfflineVoiceInfo>, String> {
    VOICES
        .iter()
        .map(|v| {
            let dir = voice_dir(&app, v)?;
            Ok(OfflineVoiceInfo {
                id: v.id.to_string(),
                name: v.name.to_string(),
                description: v.description.to_string(),
                size_mb: v.size_mb,
                installed: is_installed(&dir, v),
                speakers: v.speakers.iter().map(|s| s.to_string()).collect(),
            })
        })
        .collect()
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    received: u64,
    total: Option<u64>,
    phase: &'static str,
}

#[tauri::command]
pub async fn tts_offline_download(app: AppHandle, id: String) -> Result<(), String> {
    let v = voice(&id)?;
    let root = voices_root(&app)?;
    let dest = root.join(v.id);
    if is_installed(&dest, v) {
        return Ok(());
    }

    let tmp = root.join(".tmp").join(v.id);
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let archive_path = tmp.join(format!("{}.tar.bz2", v.archive));

    let url = format!("{RELEASE_BASE}/{}.tar.bz2", v.archive);
    let client = reqwest::Client::builder()
        .user_agent("ExileCompass")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client.get(&url).send().await.map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {} for {url}", response.status()));
    }
    let total = response.content_length();

    {
        use std::io::Write;
        let mut file = std::fs::File::create(&archive_path).map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        let mut received: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            received += chunk.len() as u64;
            if last_emit.elapsed().as_millis() >= 150 {
                last_emit = std::time::Instant::now();
                let _ = app.emit(
                    "tts-offline-progress",
                    Progress { id: id.clone(), received, total, phase: "download" },
                );
            }
        }
        let _ = app.emit("tts-offline-progress", Progress { id: id.clone(), received, total, phase: "extract" });
    }

    let extracted = tmp.join("extract");
    let v_model = v.model;
    let app2 = app.clone();
    let id2 = id.clone();
    let archive_path2 = archive_path.clone();
    let extracted2 = extracted.clone();
    let dest2 = dest.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        std::fs::create_dir_all(&extracted2).map_err(|e| e.to_string())?;
        let file = std::fs::File::open(&archive_path2).map_err(|e| e.to_string())?;
        let decoder = bzip2::read::BzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        archive.unpack(&extracted2).map_err(|e| format!("Could not extract voice archive: {e}"))?;

        let payload = find_dir_with(&extracted2, "tokens.txt")
            .ok_or_else(|| "Voice archive did not contain tokens.txt".to_string())?;
        if !payload.join(v_model).is_file() {
            return Err(format!("Voice archive did not contain {v_model}"));
        }
        let _ = std::fs::remove_dir_all(&dest2);
        std::fs::rename(&payload, &dest2).map_err(|e| e.to_string())?;
        let _ = app2.emit("tts-offline-progress", Progress { id: id2, received: 0, total: None, phase: "done" });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = std::fs::remove_dir_all(&tmp);
    Ok(())
}

fn find_dir_with(root: &Path, marker: &str) -> Option<PathBuf> {
    if root.join(marker).is_file() {
        return Some(root.to_path_buf());
    }
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(found) = find_dir_with(&p, marker) {
                return Some(found);
            }
        }
    }
    None
}

struct Loaded {
    voice_id: String,
    tts: OfflineTts,
}

pub struct TtsOfflineState(Mutex<Option<Loaded>>);

impl TtsOfflineState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
pub fn tts_offline_remove(app: AppHandle, state: State<'_, TtsOfflineState>, id: String) -> Result<(), String> {
    let v = voice(&id)?;
    {
        let mut guard = state.0.lock().unwrap();
        if guard.as_ref().map(|l| l.voice_id == id).unwrap_or(false) {
            *guard = None;
        }
    }
    let dir = voice_dir(&app, v)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn build_engine(dir: &Path, v: &Voice) -> Result<OfflineTts, String> {
    let s = |p: PathBuf| p.to_string_lossy().into_owned();
    let mut config = OfflineTtsConfig::default();
    config.model.provider = Some("cpu".to_string());
    config.model.num_threads = 2;
    match v.kind {
        Kind::Vits => {
            config.model.vits.model = Some(s(dir.join(v.model)));
            config.model.vits.tokens = Some(s(dir.join("tokens.txt")));
            config.model.vits.data_dir = Some(s(dir.join("espeak-ng-data")));
        }
        Kind::Kokoro => {
            config.model.kokoro.model = Some(s(dir.join(v.model)));
            config.model.kokoro.voices = Some(s(dir.join("voices.bin")));
            config.model.kokoro.tokens = Some(s(dir.join("tokens.txt")));
            config.model.kokoro.data_dir = Some(s(dir.join("espeak-ng-data")));
        }
    }
    OfflineTts::create(&config).ok_or_else(|| format!("Could not load offline voice {}", v.name))
}

#[tauri::command]
pub async fn tts_offline_speak(
    app: AppHandle,
    text: String,
    voice_id: String,
    speaker: Option<i32>,
    speed: Option<f32>,
    device_name: Option<String>,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }
    let v = voice(&voice_id)?;
    let dir = voice_dir(&app, v)?;
    if !is_installed(&dir, v) {
        return Err(format!("Offline voice {} is not downloaded yet", v.name));
    }

    // One engine instance is kept loaded (model load is ~0.7s for Piper, more
    // for Kokoro); synthesis runs under its lock. Callers are serialized by
    // tts.svelte.ts anyway.
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let state = app.state::<TtsOfflineState>();
        let mut guard = state.0.lock().unwrap();
        let reload = guard.as_ref().map(|l| l.voice_id != voice_id).unwrap_or(true);
        if reload {
            *guard = None;
            let tts = build_engine(&dir, v)?;
            *guard = Some(Loaded { voice_id: voice_id.clone(), tts });
        }
        let loaded = guard.as_ref().unwrap();

        let gen = GenerationConfig {
            sid: speaker.unwrap_or(0).max(0),
            speed: speed.unwrap_or(1.0).clamp(0.5, 2.0),
            ..GenerationConfig::default()
        };
        let audio = loaded
            .tts
            .generate_with_config::<fn(&[f32], f32) -> bool>(&text, &gen, None)
            .ok_or_else(|| "Offline voice produced no audio".to_string())?;
        let samples = audio.samples().to_vec();
        let sample_rate = audio.sample_rate().max(8000) as u32;
        drop(guard);

        let device = crate::tts::resolve_output_device(&device_name)?;
        let (_stream, handle) = rodio::OutputStream::try_from_device(&device).map_err(|e| e.to_string())?;
        let sink = rodio::Sink::try_new(&handle).map_err(|e| e.to_string())?;
        sink.append(rodio::buffer::SamplesBuffer::new(1, sample_rate, samples));
        sink.sleep_until_end();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
