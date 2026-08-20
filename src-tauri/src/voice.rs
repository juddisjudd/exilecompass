// Voice commands: sherpa-onnx keyword spotting (Zipformer transducer,
// GigaSpeech-trained). See resources/kws/README.md for keywords.txt provenance.

use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample as CpalSample, SizedSample};
use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};
use tauri::{AppHandle, Emitter, Manager, State};

/// Must match the `@display` names in resources/kws/keywords.txt.
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

/// Packaged resource dir, falling back to the source-tree path under `tauri dev`.
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

/// Validates model files exist before handing paths to the FFI loader, which
/// fails opaquely (and possibly unsafely) on a bad path.
fn build_keyword_spotter(app: &AppHandle) -> Result<KeywordSpotter, String> {
    let dir = kws_resource_dir(app)?;
    let resolved = |name: &str| -> Result<String, String> {
        let p = dir.join(name);
        if !p.is_file() {
            return Err(format!("Missing keyword-spotting model file: {}", p.display()));
        }
        Ok(p.to_string_lossy().into_owned())
    };

    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder = Some(resolved("encoder.onnx")?);
    config.model_config.transducer.decoder = Some(resolved("decoder.onnx")?);
    config.model_config.transducer.joiner = Some(resolved("joiner.onnx")?);
    config.model_config.tokens = Some(resolved("tokens.txt")?);
    config.model_config.provider = Some("cpu".to_string());
    config.keywords_file = Some(resolved("keywords.txt")?);
    // Raised because some phrases share a prefix (e.g. skill1/skill1supports).
    config.num_trailing_blanks = 6;

    KeywordSpotter::create(&config).ok_or_else(|| "Failed to create keyword spotter".to_string())
}

// ── Input devices ────────────────────────────────────────────────────────

#[tauri::command]
pub fn voice_list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

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

struct AudioChunk {
    samples: Vec<f32>,
    rms: f32,
}

fn run_listening_thread(
    app: AppHandle,
    device_name: Option<String>,
    ready_tx: mpsc::Sender<Result<(), String>>,
    stop_rx: mpsc::Receiver<()>,
) {
    // catch_unwind only guards against Rust panics, not a C++/FFI-level fault in sherpa-onnx.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_listening_thread_inner(&app, device_name, &ready_tx, &stop_rx)
    }));
    if let Err(_) = result {
        let _ = ready_tx.send(Err("Voice listening crashed (see logs)".to_string()));
        let _ = app.emit("voice-listening-stopped", ());
    }
}

fn run_listening_thread_inner(
    app: &AppHandle,
    device_name: Option<String>,
    ready_tx: &mpsc::Sender<Result<(), String>>,
    stop_rx: &mpsc::Receiver<()>,
) {
    let kws = match build_keyword_spotter(app) {
        Ok(k) => k,
        Err(e) => {
            let _ = ready_tx.send(Err(e));
            return;
        }
    };

    let (chunk_tx, chunk_rx) = mpsc::sync_channel::<AudioChunk>(32);

    let (stream, sample_rate) = match build_capture_stream(app, &device_name, chunk_tx) {
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

    // Decode runs off the real-time audio callback thread.
    let app_for_decode = app.clone();
    let decode_thread = std::thread::spawn(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            decode_loop(kws, chunk_rx, app_for_decode, sample_rate);
        }));
    });

    let _ = ready_tx.send(Ok(()));

    let _ = stop_rx.recv();
    drop(stream); // stops capture, drops chunk_tx, ending decode_loop
    let _ = decode_thread.join();
    let _ = app.emit("voice-listening-stopped", ());
}

fn decode_loop(kws: KeywordSpotter, chunk_rx: mpsc::Receiver<AudioChunk>, app: AppHandle, sample_rate: u32) {
    let stream_handle = kws.create_stream();
    let emit_every_samples = sample_rate as u64 / 15;
    let mut samples_since_emit: u64 = 0;

    while let Ok(chunk) = chunk_rx.recv() {
        stream_handle.accept_waveform(sample_rate as i32, &chunk.samples);
        while kws.is_ready(&stream_handle) {
            kws.decode(&stream_handle);
            if let Some(result) = kws.get_result(&stream_handle) {
                if !result.keyword.is_empty() {
                    let _ = app.emit("voice-command", result.keyword.clone());
                    kws.reset(&stream_handle);
                }
            }
        }

        samples_since_emit += chunk.samples.len() as u64;
        if samples_since_emit >= emit_every_samples {
            samples_since_emit = 0;
            let _ = app.emit("voice-recording-level", chunk.rms);
        }
    }
}

fn build_capture_stream(
    app: &AppHandle,
    device_name: &Option<String>,
    chunk_tx: mpsc::SyncSender<AudioChunk>,
) -> Result<(cpal::Stream, u32), String> {
    let device = resolve_input_device(device_name)?;
    let device_config = device.default_input_config().map_err(|e| e.to_string())?;
    let stream_config = cpal::StreamConfig {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let sample_rate = stream_config.sample_rate.0;
    let _ = app;
    let stream = match device_config.sample_format() {
        cpal::SampleFormat::I8 => build_capture_stream_typed::<i8>(&device, &stream_config, chunk_tx),
        cpal::SampleFormat::I16 => build_capture_stream_typed::<i16>(&device, &stream_config, chunk_tx),
        cpal::SampleFormat::I32 => build_capture_stream_typed::<i32>(&device, &stream_config, chunk_tx),
        cpal::SampleFormat::F32 => build_capture_stream_typed::<f32>(&device, &stream_config, chunk_tx),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }?;
    Ok((stream, sample_rate))
}

fn build_capture_stream_typed<T>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    chunk_tx: mpsc::SyncSender<AudioChunk>,
) -> Result<cpal::Stream, String>
where
    T: CpalSample + SizedSample,
    f32: FromSample<T>,
{
    let channels = stream_config.channels as usize;
    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        let mut samples = Vec::with_capacity(data.len() / channels.max(1) + 1);
        let mut sum_sq = 0f32;
        if channels <= 1 {
            for &s in data {
                let f: f32 = f32::from_sample(s);
                sum_sq += f * f;
                samples.push(f);
            }
        } else {
            for frame in data.chunks(channels) {
                let sum: f32 = frame.iter().map(|&s| f32::from_sample(s)).sum();
                let f = sum / frame.len() as f32;
                sum_sq += f * f;
                samples.push(f);
            }
        }
        if samples.is_empty() {
            return;
        }
        let rms = (sum_sq / samples.len() as f32).sqrt().min(1.0);
        let _ = chunk_tx.try_send(AudioChunk { samples, rms });
    };
    let error_callback = |err| eprintln!("voice listening stream error: {err}");
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
}
