// Voice commands: sherpa-onnx keyword spotting (Zipformer transducer,
// GigaSpeech-trained). See resources/kws/README.md for keywords.txt provenance.
//
// cpal's real-time capture callback only conditions the audio (AGC and an
// anti-aliased resample to 16 kHz — audio.rs) and queues it; a dedicated
// decode thread feeds the spotter. We always hand sherpa 16 kHz audio and say
// so: matching in==out skips its internal resampler, which was reliably
// crashing (STATUS_STACK_BUFFER_OVERRUN, ONNX Reshape failure in the encoder's
// downsample step) when fed a 44100/48000 device rate. Upstream's own
// microphone example sidesteps it the same way, opening the device at 16 kHz
// rather than resampling in the model.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample as CpalSample, SizedSample};
use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::audio::{Agc, Resampler};

pub const KWS_SAMPLE_RATE: u32 = 16000;
pub const DEFAULT_KEYWORDS_THRESHOLD: f32 = 0.25;
/// Beam width of the keyword search. Upstream's default of 4 is sized for a
/// couple of short wake words; sixty phrases of up to 13 tokens need room for
/// a long phrase's hypothesis to survive one weakly scored token.
pub const MAX_ACTIVE_PATHS: i32 = 8;
/// Each blank is ~40 ms of confirmation silence after the phrase.
pub const NUM_TRAILING_BLANKS: i32 = 3;

/// About 2.5 s of audio at cpal's ~10 ms callbacks. The game keeps every core
/// busy, so the decode thread can be off-CPU for long stretches; anything the
/// queue can't hold is dropped and the phrase reaches the model with a hole
/// in it.
const CHUNK_QUEUE_LEN: usize = 256;
/// Upper bound on queued chunks folded into one decode pass when catching up.
const MAX_COALESCE: usize = 64;
const LEVEL_EVENTS_PER_SEC: u64 = 15;
/// Below this post-AGC RMS a chunk counts as silence for level reporting.
const LEVEL_SILENCE_RMS: f32 = 0.002;
/// Level events keep flowing this long after the last audible chunk (so the
/// Settings meter finishes its release and peak-hold), then stop until sound
/// returns — silence is most of a session, and it needs no 15 Hz IPC.
const LEVEL_SILENCE_HOLD: Duration = Duration::from_secs(4);
/// A capture stream that stops delivering audio without reporting an error
/// (device yanked, driver reset) is treated as failed after this long.
const STALL_TIMEOUT: Duration = Duration::from_secs(5);

/// Must match the `@display` names in resources/kws/keywords.txt.
pub const PHRASES: &[&str] = &[
    "next",
    "back",
    "nextstep",
    "rewards",
    "campaign",
    "build",
    "timer",
    "leveling",
    "gems",
    "tree",
    "stash",
    "crafting",
    "addons",
    "skill1",
    "skill2",
    "skill3",
    "skill4",
    "skill5",
    "skills",
    "spirit",
    "skill1supports",
    "skill2supports",
    "skill3supports",
    "skill4supports",
    "skill5supports",
    "spiritsupports",
    "weapon",
    "helmet",
    "bodyarmour",
    "gloves",
    "boots",
    "amulet",
    "rings",
    "belt",
    "uniques",
    "flasks",
    "charms",
    "buildinfo",
    "weaponstats",
    "helmetstats",
    "bodyarmourstats",
    "glovesstats",
    "bootsstats",
    "amuletstats",
    "ringsstats",
    "beltstats",
    "timerstart",
    "timerstop",
    "timerreset",
    "timerstatus",
    "timersplit",
    "timermodemanual",
    "timermodecampaign",
    "clickthroughon",
    "clickthroughoff",
];

#[tauri::command]
pub fn voice_list_phrases() -> Vec<String> {
    PHRASES.iter().map(|s| s.to_string()).collect()
}

enum Control {
    Stop,
    Failed(String),
}

pub struct VoiceState {
    /// Sender for the live session, tagged with its generation.
    control: Mutex<Option<(u64, mpsc::Sender<Control>)>>,
    /// Bumped per start, so a session winding down late can neither clear a
    /// newer session's sender nor report its own stop as the current state.
    generation: AtomicU64,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            control: Mutex::new(None),
            generation: AtomicU64::new(0),
        }
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    fn clear_control(&self, generation: u64) {
        let mut guard = self.control.lock().unwrap();
        if guard.as_ref().map(|(g, _)| *g == generation).unwrap_or(false) {
            *guard = None;
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

/// The spotter configuration the app runs with, for `dir` holding the model
/// files. Shared with examples/kws_eval.rs so offline checks use the real
/// settings. Validates the files exist first — the FFI loader fails opaquely
/// (and possibly unsafely) on a bad path.
pub fn spotter_config(dir: &Path, keywords_threshold: f32) -> Result<KeywordSpotterConfig, String> {
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
    config.max_active_paths = MAX_ACTIVE_PATHS;
    config.num_trailing_blanks = NUM_TRAILING_BLANKS;
    config.keywords_threshold = keywords_threshold.clamp(0.05, 0.9);
    Ok(config)
}

fn build_keyword_spotter(app: &AppHandle, keywords_threshold: Option<f32>) -> Result<KeywordSpotter, String> {
    let dir = kws_resource_dir(app)?;
    let config = spotter_config(&dir, keywords_threshold.unwrap_or(DEFAULT_KEYWORDS_THRESHOLD))?;
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
    state.control.lock().unwrap().is_some()
}

#[tauri::command]
pub async fn voice_start_listening(
    app: AppHandle,
    state: State<'_, VoiceState>,
    device_name: Option<String>,
    keywords_threshold: Option<f32>,
) -> Result<(), String> {
    if state.control.lock().unwrap().is_some() {
        return Ok(()); // already running
    }
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (control_tx, control_rx) = mpsc::channel::<Control>();
    *state.control.lock().unwrap() = Some((generation, control_tx.clone()));
    let app_handle = app.clone();
    std::thread::spawn(move || {
        run_listening_thread(app_handle, generation, device_name, keywords_threshold, ready_tx, control_tx, control_rx);
    });

    tauri::async_runtime::spawn_blocking(move || ready_rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "Voice listening thread exited before starting".to_string())?
}

#[tauri::command]
pub fn voice_stop_listening(state: State<'_, VoiceState>) {
    if let Some((_, tx)) = state.control.lock().unwrap().take() {
        let _ = tx.send(Control::Stop);
    }
}

struct AudioChunk {
    samples: Vec<f32>,
    rms: f32,
}

fn run_listening_thread(
    app: AppHandle,
    generation: u64,
    device_name: Option<String>,
    keywords_threshold: Option<f32>,
    ready_tx: mpsc::Sender<Result<(), String>>,
    control_tx: mpsc::Sender<Control>,
    control_rx: mpsc::Receiver<Control>,
) {
    // catch_unwind only guards against Rust panics, not a C++/FFI-level fault in sherpa-onnx.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_listening_thread_inner(&app, device_name, keywords_threshold, &ready_tx, control_tx, &control_rx)
    }));
    let state = app.state::<VoiceState>();
    state.clear_control(generation);
    let stop_reason = match result {
        Ok(Ok(reason)) => reason,
        // Never got going: the start command reports this error itself.
        Ok(Err(start_error)) => {
            let _ = ready_tx.send(Err(start_error));
            return;
        }
        Err(_) => {
            let msg = "Voice listening crashed (see logs)".to_string();
            let _ = ready_tx.send(Err(msg.clone()));
            msg
        }
    };
    // A restart (device/sensitivity change) supersedes this session — its
    // stop must not flip the indicator off under the new one.
    if state.is_current(generation) {
        let _ = app.emit("voice-listening-stopped", stop_reason);
    }
}

/// Runs the session to completion. `Err` means it never started (reported by
/// the start command); `Ok(reason)` means it ran and then stopped — an empty
/// reason for a requested stop, otherwise why the capture failed.
fn run_listening_thread_inner(
    app: &AppHandle,
    device_name: Option<String>,
    keywords_threshold: Option<f32>,
    ready_tx: &mpsc::Sender<Result<(), String>>,
    control_tx: mpsc::Sender<Control>,
    control_rx: &mpsc::Receiver<Control>,
) -> Result<String, String> {
    let kws = build_keyword_spotter(app, keywords_threshold)?;

    let (chunk_tx, chunk_rx) = mpsc::sync_channel::<AudioChunk>(CHUNK_QUEUE_LEN);
    let dropped = Arc::new(AtomicU64::new(0));
    let started = Instant::now();
    let last_chunk_ms = Arc::new(AtomicU64::new(0));

    let stream = build_capture_stream(
        &device_name,
        Capture {
            chunk_tx,
            control_tx,
            dropped: Arc::clone(&dropped),
            last_chunk_ms: Arc::clone(&last_chunk_ms),
            started,
        },
    )?;
    stream.play().map_err(|e| e.to_string())?;

    // Decode runs off the real-time audio callback thread.
    let app_for_decode = app.clone();
    let decode_thread = std::thread::spawn(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            decode_loop(kws, chunk_rx, app_for_decode, dropped);
        }));
    });

    let _ = ready_tx.send(Ok(()));

    let reason = loop {
        match control_rx.recv_timeout(Duration::from_secs(1)) {
            Ok(Control::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break String::new(),
            Ok(Control::Failed(error)) => break error,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let idle_ms = elapsed_ms(started).saturating_sub(last_chunk_ms.load(Ordering::Relaxed));
                if idle_ms >= STALL_TIMEOUT.as_millis() as u64 {
                    break "The microphone stopped delivering audio".to_string();
                }
            }
        }
    };

    drop(stream); // stops capture, drops chunk_tx, ending decode_loop
    let _ = decode_thread.join();
    Ok(reason)
}

fn elapsed_ms(since: Instant) -> u64 {
    since.elapsed().as_millis() as u64
}

/// The decode thread competes with the game for CPU. It only has to keep up
/// with real time, so a small priority bump is enough to keep it from being
/// starved for whole seconds while every core is busy.
#[cfg(target_os = "windows")]
fn raise_decode_thread_priority() {
    use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL};
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
    }
}

#[cfg(not(target_os = "windows"))]
fn raise_decode_thread_priority() {}

fn decode_loop(kws: KeywordSpotter, chunk_rx: mpsc::Receiver<AudioChunk>, app: AppHandle, dropped: Arc<AtomicU64>) {
    raise_decode_thread_priority();
    let stream_handle = kws.create_stream();
    let emit_every_samples = KWS_SAMPLE_RATE as u64 / LEVEL_EVENTS_PER_SEC;
    let mut samples_since_emit: u64 = 0;
    let mut window_rms = 0f32;
    let mut last_audible = Instant::now();
    let mut dropped_reported = 0u64;
    let mut dropped_reported_at = Instant::now();

    while let Ok(first) = chunk_rx.recv() {
        // Fold in whatever queued while the last pass ran, so a thread that
        // fell behind catches up in one decode pass rather than one chunk
        // per pass.
        let mut chunk = first;
        let mut coalesced = 0;
        loop {
            stream_handle.accept_waveform(KWS_SAMPLE_RATE as i32, &chunk.samples);
            samples_since_emit += chunk.samples.len() as u64;
            window_rms = window_rms.max(chunk.rms);
            coalesced += 1;
            if coalesced >= MAX_COALESCE {
                break;
            }
            match chunk_rx.try_recv() {
                Ok(next) => chunk = next,
                Err(_) => break,
            }
        }

        while kws.is_ready(&stream_handle) {
            kws.decode(&stream_handle);
            if let Some(result) = kws.get_result(&stream_handle) {
                if !result.keyword.is_empty() {
                    let _ = app.emit("voice-command", result.keyword.clone());
                    kws.reset(&stream_handle);
                }
            }
        }

        if samples_since_emit >= emit_every_samples {
            samples_since_emit = 0;
            let now = Instant::now();
            if window_rms >= LEVEL_SILENCE_RMS {
                last_audible = now;
            }
            if now.duration_since(last_audible) <= LEVEL_SILENCE_HOLD {
                let _ = app.emit("voice-recording-level", window_rms);
            }
            window_rms = 0.0;
        }

        let dropped_now = dropped.load(Ordering::Relaxed);
        if dropped_now > dropped_reported && dropped_reported_at.elapsed() >= Duration::from_secs(30) {
            eprintln!(
                "voice: {} audio chunks dropped since last report (decode thread starved)",
                dropped_now - dropped_reported
            );
            dropped_reported = dropped_now;
            dropped_reported_at = Instant::now();
        }
    }
}

struct Capture {
    chunk_tx: mpsc::SyncSender<AudioChunk>,
    control_tx: mpsc::Sender<Control>,
    dropped: Arc<AtomicU64>,
    last_chunk_ms: Arc<AtomicU64>,
    started: Instant,
}

fn build_capture_stream(device_name: &Option<String>, capture: Capture) -> Result<cpal::Stream, String> {
    let device = resolve_input_device(device_name)?;
    let device_config = device.default_input_config().map_err(|e| e.to_string())?;
    let stream_config = cpal::StreamConfig {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    match device_config.sample_format() {
        cpal::SampleFormat::I8 => build_capture_stream_typed::<i8>(&device, &stream_config, capture),
        cpal::SampleFormat::I16 => build_capture_stream_typed::<i16>(&device, &stream_config, capture),
        cpal::SampleFormat::I32 => build_capture_stream_typed::<i32>(&device, &stream_config, capture),
        cpal::SampleFormat::F32 => build_capture_stream_typed::<f32>(&device, &stream_config, capture),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn build_capture_stream_typed<T>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    capture: Capture,
) -> Result<cpal::Stream, String>
where
    T: CpalSample + SizedSample,
    f32: FromSample<T>,
{
    let Capture { chunk_tx, control_tx, dropped, last_chunk_ms, started } = capture;
    let channels = stream_config.channels as usize;
    let capture_rate = stream_config.sample_rate.0;
    let mut resampler = Resampler::new(capture_rate, KWS_SAMPLE_RATE);
    let mut agc = Agc::new(capture_rate);
    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        let mut samples = Vec::with_capacity(data.len() / channels.max(1) + 1);
        if channels <= 1 {
            samples.extend(data.iter().map(|&s| f32::from_sample(s)));
        } else {
            for frame in data.chunks(channels) {
                let sum: f32 = frame.iter().map(|&s| f32::from_sample(s)).sum();
                samples.push(sum / frame.len() as f32);
            }
        }
        if samples.is_empty() {
            return;
        }
        last_chunk_ms.store(elapsed_ms(started), Ordering::Relaxed);
        let rms = agc.process(&mut samples);
        let resampled = resampler.process(&samples);
        if resampled.is_empty() {
            return;
        }
        if chunk_tx.try_send(AudioChunk { samples: resampled, rms }).is_err() {
            dropped.fetch_add(1, Ordering::Relaxed);
        }
    };
    let error_callback = move |err: cpal::StreamError| {
        eprintln!("voice listening stream error: {err}");
        let _ = control_tx.send(Control::Failed(format!("Microphone stream error: {err}")));
    };
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
}
