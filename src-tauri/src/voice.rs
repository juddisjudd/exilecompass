// Voice commands: sherpa-onnx keyword spotting (Zipformer transducer,
// GigaSpeech-trained, Apache-2.0) — replaces an earlier rustpotter-based
// implementation. rustpotter (github.com/GiviMAD/rustpotter) hadn't been
// touched since Oct 2023, and its own README explicitly says "this is not
// intended to be a production-grade tool" — worth taking seriously for a
// feature that's actually shipping.
//
// sherpa-onnx's keyword-spotting model works fundamentally differently in a
// way that fits this app much better than rustpotter did: keywords are added
// as *text*, converted to tokens once, offline, against one shared
// pre-trained model — not per-user audio recordings needing an in-app
// training wizard. Our phrases are fixed/developer-defined (not something a
// user invents), so that's a strictly better fit: zero setup, one bundled
// ~5MB model instead of N per-phrase reference files, and accuracy from a
// model trained on 10,000 hours of real speech (GigaSpeech) instead of a
// handful of one person's recordings in one room with one mic. See
// resources/kws/README.md for exactly how keywords.txt was generated and how
// to regenerate it if the phrase set ever changes.
//
// One real capability this trades away: rustpotter exposed a live,
// continuously updating confidence score per phrase
// (`Rustpotter::get_partial_detection`), which drove a "how close is this to
// firing" meter in Settings. Sherpa's `KeywordSpotter` only exposes pass/fail
// results after a keyword actually fires — there's no equivalent partial-
// match introspection in its API. The mic input-level meter (ours, computed
// directly from captured samples, independent of whichever engine is
// listening) is what's left to answer "is my mic even being picked up";
// "did it just hear something" is now answered by the `voice-command` event
// itself rather than a live-building score.

use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample as CpalSample, SizedSample};
use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};
use tauri::{AppHandle, Emitter, Manager, State};

/// Every phrase id the app can dispatch on. Matched 1:1 against the
/// `@display` name baked into resources/kws/keywords.txt at generation time
/// — `KeywordSpotter::get_result()` returns exactly this string as
/// `.keyword`, so there is no separate id-translation table to keep in sync.
/// Changing this list means regenerating keywords.txt (see that file's
/// README), not just editing Rust/TS.
pub const PHRASES: &[&str] = &[
    "next",
    "back",
    "rewards",
    "campaign",
    "build",
    "skill1",
    "skill2",
    "skill3",
    "spirit",
    "skill1supports",
    "skill2supports",
    "skill3supports",
    "spiritsupports",
];

#[tauri::command]
pub fn voice_list_phrases() -> Vec<String> {
    PHRASES.iter().map(|s| s.to_string()).collect()
}

pub struct VoiceState {
    stop_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            stop_tx: Mutex::new(None),
        }
    }
}

/// Resolves the bundled keyword-spotting model directory. Tries the real
/// packaged-app resource location first; falls back to a path baked in at
/// compile time pointing straight at `src-tauri/resources/kws` in the source
/// tree. The fallback exists because `resource_dir()`'s exact behavior under
/// `tauri dev` (unbundled) isn't clearly documented one way or the other —
/// rather than assume, this just works either way.
fn kws_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("resources").join("kws");
        if candidate.is_dir() {
            return Ok(candidate);
        }
    }
    let dev_fallback = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/kws"));
    if dev_fallback.is_dir() {
        return Ok(dev_fallback);
    }
    Err("Keyword-spotting model resources not found (checked both the packaged resource dir and the dev-mode source path)".to_string())
}

fn build_keyword_spotter(app: &AppHandle) -> Result<KeywordSpotter, String> {
    let dir = kws_resource_dir(app)?;
    let path = |name: &str| dir.join(name).to_string_lossy().into_owned();

    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder = Some(path("encoder.onnx"));
    config.model_config.transducer.decoder = Some(path("decoder.onnx"));
    config.model_config.transducer.joiner = Some(path("joiner.onnx"));
    config.model_config.tokens = Some(path("tokens.txt"));
    config.model_config.provider = Some("cpu".to_string());
    config.keywords_file = Some(path("keywords.txt"));
    // Several of our phrases share a prefix with a longer sibling
    // ("skill1" vs "skill1supports") — the upstream docs specifically call
    // out raising this when keywords have overlapping tokens, to stop the
    // shorter phrase from firing prematurely partway through the longer one.
    config.num_trailing_blanks = 6;

    KeywordSpotter::create(&config).ok_or_else(|| "Failed to create keyword spotter".to_string())
}

// ── Input devices ────────────────────────────────────────────────────────

/// Every input device the OS currently exposes, by name, for the Settings
/// mic picker. `default_input_device()` isn't necessarily the mic the user
/// actually wants — e.g. a game headset mic sitting alongside a webcam mic
/// or a virtual audio device from OBS/Voicemeeter/Discord.
#[tauri::command]
pub fn voice_list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

/// Resolve the chosen device by name, falling back to the OS default if
/// `selected` is None or no longer present (e.g. a headset unplugged since
/// it was picked).
fn resolve_input_device(selected: &Option<String>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(name) = selected {
        if let Ok(mut devices) = host.input_devices() {
            if let Some(d) = devices.find(|d| d.name().map(|n| n == *name).unwrap_or(false)) {
                return Ok(d);
            }
        }
    }
    host.default_input_device().ok_or_else(|| "No microphone found".to_string())
}

// ── Live listening ────────────────────────────────────────────────────────

#[tauri::command]
pub fn voice_is_listening(state: State<'_, VoiceState>) -> bool {
    state.stop_tx.lock().unwrap().is_some()
}

#[tauri::command]
pub async fn voice_start_listening(
    app: AppHandle,
    state: State<'_, VoiceState>,
    device_name: Option<String>,
) -> Result<(), String> {
    if state.stop_tx.lock().unwrap().is_some() {
        return Ok(()); // already running
    }

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        run_listening_thread(app_handle, device_name, ready_tx, stop_rx);
    });

    let ready = tauri::async_runtime::spawn_blocking(move || ready_rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Voice listening thread exited before starting".to_string())?;
    ready?;

    *state.stop_tx.lock().unwrap() = Some(stop_tx);
    Ok(())
}

#[tauri::command]
pub fn voice_stop_listening(state: State<'_, VoiceState>) {
    if let Some(tx) = state.stop_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

fn run_listening_thread(
    app: AppHandle,
    device_name: Option<String>,
    ready_tx: mpsc::Sender<Result<(), String>>,
    stop_rx: mpsc::Receiver<()>,
) {
    let stream = match build_listening_stream(&app, &device_name) {
        Ok(s) => s,
        Err(e) => {
            let _ = ready_tx.send(Err(e));
            return;
        }
    };
    if let Err(e) = stream.play() {
        let _ = ready_tx.send(Err(e.to_string()));
        return;
    }
    let _ = ready_tx.send(Ok(()));

    // Block until voice_stop_listening signals us. A hardware-level stream
    // error only logs (see build_spot_stream's error_callback) — cpal doesn't
    // hand back a way to detect that from here, so this thread keeps waiting
    // for an explicit stop rather than reacting to it.
    let _ = stop_rx.recv();
    drop(stream);
    let _ = app.emit("voice-listening-stopped", ());
}

fn build_listening_stream(
    app: &AppHandle,
    device_name: &Option<String>,
) -> Result<cpal::Stream, String> {
    let kws = build_keyword_spotter(app)?;

    let device = resolve_input_device(device_name)?;
    let device_config = device.default_input_config().map_err(|e| e.to_string())?;
    let stream_config = cpal::StreamConfig {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let app = app.clone();
    match device_config.sample_format() {
        cpal::SampleFormat::I8 => build_spot_stream::<i8>(&device, &stream_config, kws, app),
        cpal::SampleFormat::I16 => build_spot_stream::<i16>(&device, &stream_config, kws, app),
        cpal::SampleFormat::I32 => build_spot_stream::<i32>(&device, &stream_config, kws, app),
        cpal::SampleFormat::F32 => build_spot_stream::<f32>(&device, &stream_config, kws, app),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn build_spot_stream<T>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    kws: KeywordSpotter,
    app: AppHandle,
) -> Result<cpal::Stream, String>
where
    T: CpalSample + SizedSample,
    f32: FromSample<T>,
{
    let sample_rate = stream_config.sample_rate.0 as i32;
    let channels = stream_config.channels as usize;
    let stream_handle = kws.create_stream();

    // Live mic-input level meter, independent of the keyword spotter —
    // throttled like the recording-time version, ~15/sec.
    let emit_every_samples =
        ((stream_config.sample_rate.0 as u64 * stream_config.channels as u64) / 15).max(1);
    let mut samples_since_emit: u64 = 0;

    // Reused across callbacks so each invocation doesn't reallocate; sized
    // generously since cpal buffer sizes vary by device/backend.
    let mut mono_buffer: Vec<f32> = Vec::with_capacity(4096);

    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        mono_buffer.clear();
        let mut sum_sq = 0f32;
        if channels <= 1 {
            for &s in data {
                let f: f32 = f32::from_sample(s);
                sum_sq += f * f;
                mono_buffer.push(f);
            }
        } else {
            // Downmix to mono by averaging channels — the model only wants
            // one channel, and a lone level meter has no use for stereo.
            for frame in data.chunks(channels) {
                let mut sum = 0f32;
                for &s in frame {
                    sum += f32::from_sample(s);
                }
                let f = sum / channels as f32;
                sum_sq += f * f;
                mono_buffer.push(f);
            }
        }

        stream_handle.accept_waveform(sample_rate, &mono_buffer);
        while kws.is_ready(&stream_handle) {
            kws.decode(&stream_handle);
            if let Some(result) = kws.get_result(&stream_handle) {
                if !result.keyword.is_empty() {
                    let _ = app.emit("voice-command", result.keyword.clone());
                    kws.reset(&stream_handle);
                }
            }
        }

        samples_since_emit += mono_buffer.len() as u64;
        if !mono_buffer.is_empty() && samples_since_emit >= emit_every_samples {
            samples_since_emit = 0;
            let rms = (sum_sq / mono_buffer.len() as f32).sqrt().min(1.0);
            let _ = app.emit("voice-recording-level", rms);
        }
    };
    let error_callback = |err| eprintln!("voice listening stream error: {err}");
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
}
