// Voice commands ("compass next" / "compass back"): a locally-trained,
// always-off-by-default wake-phrase spotter built on rustpotter. Rustpotter's
// wakeword "references" are example-based, not a shippable universal model —
// they're built from a handful of the actual user's own recordings, so setup
// requires a short one-time recording wizard per phrase rather than a
// pre-shipped file. See https://github.com/GiviMAD/rustpotter.
//
// Threading: cpal streams are built, played, and torn down entirely on one
// dedicated thread per session (mirroring rustpotter-cli's own reference
// implementation) rather than stored in shared state, sidestepping any
// question of whether `cpal::Stream` can cross threads on a given backend.
// Recording and listening both hand a start/stop signal back over a plain
// `std::sync::mpsc` channel.

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample as CpalSample, SizedSample};
use rustpotter::{
    Rustpotter, RustpotterConfig, Sample as RpSample, SampleFormat as RpSampleFormat, WakewordRef,
    WakewordRefBuildFromFiles, WakewordSave,
};
use tauri::{AppHandle, Emitter, Manager, State};

/// Every phrase id the app can train/listen for. Adding a new voice command
/// means adding its id here plus its label/dispatch handling on the frontend
/// (voice.svelte.ts / +page.svelte) — recording, training, and listening are
/// all generic over this list. Ids are internal keys only (filenames and the
/// `voice-command` event payload); the spoken phrase is whatever the user
/// actually records, guided by the frontend's on-screen label for that id.
///
/// Each phrase gets its own independent Rustpotter instance at listen time
/// (see build_listening_stream), so — unlike a single shared instance —
/// there's no hard requirement they share one mfcc_size or stay a small
/// number for correctness. There IS an open perf/accuracy question as this
/// list grows: every trained phrase adds another full detector processing
/// every audio frame in real time, and phrases with heavy text overlap
/// ("skill1" vs "skill1supports") haven't been validated against each other
/// yet. Grow this list incrementally and re-test, don't assume it scales.
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

/// mfcc_size used when training every phrase — 16 matches rustpotter-cli's
/// own default. No longer a hard cross-phrase requirement (see PHRASES doc),
/// just kept uniform for predictability.
const MFCC_SIZE: u16 = 16;
/// Minimum recordings before a phrase can be trained; rustpotter recommends
/// 3-8 samples per wakeword reference.
const MIN_SAMPLES: usize = 3;
/// The frontend computes a per-phrase duration (roughly scaled to word count
/// — "compass next" needs far less time than "compass third skill supports")
/// and passes it per call; these are just sanity bounds against a bad value,
/// not a real default. A single fixed duration used to be hardcoded here for
/// every phrase regardless of length, which silently truncated recordings of
/// the longer build-info phrases mid-sentence — every sample trained from a
/// cut-off clip, so nothing built from them could ever reliably detect.
const MIN_DURATION_MS: u64 = 1200;
const MAX_DURATION_MS: u64 = 6000;
/// Stricter than the library default (5) since this listens continuously in
/// the background during gameplay — fewer accidental triggers from game
/// audio/voice chat at the cost of needing a clearer, more deliberate phrase.
const LISTEN_MIN_SCORES: usize = 8;

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

fn validate_phrase(phrase: &str) -> Result<(), String> {
    if PHRASES.contains(&phrase) {
        Ok(())
    } else {
        Err(format!("Unknown voice phrase: {phrase}"))
    }
}

/// The phrase registry, for the frontend to build its setup UI from.
#[tauri::command]
pub fn voice_list_phrases() -> Vec<String> {
    PHRASES.iter().map(|s| s.to_string()).collect()
}

/// Every input device the OS currently exposes, by name, for the Settings
/// mic picker. `default_input_device()` isn't necessarily the mic the user
/// actually wants — e.g. a game headset mic sitting alongside a webcam mic
/// or a virtual audio device from OBS/Voicemeeter/Discord — and silently
/// recording from the wrong one produces near-silent samples that train (and
/// then never detect) just as "successfully" as good ones, with no error
/// anywhere to point at it.
#[tauri::command]
pub fn voice_list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

/// Resolve the chosen device by name, falling back to the OS default if
/// `selected` is None or no longer present (e.g. a headset that's been
/// unplugged since it was picked).
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

fn voice_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("voice"))
}

fn samples_dir(app: &AppHandle, phrase: &str) -> Result<PathBuf, String> {
    Ok(voice_dir(app)?.join("samples").join(phrase))
}

fn model_path(app: &AppHandle, phrase: &str) -> Result<PathBuf, String> {
    Ok(voice_dir(app)?.join(format!("{phrase}.rpw")))
}

fn list_sample_files(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut samples: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|ext| ext == "wav").unwrap_or(false))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    samples.sort();
    samples
}

// ── Setup: recording samples & training a reference ─────────────────────────

#[tauri::command]
pub fn voice_sample_count(app: AppHandle, phrase: String) -> Result<usize, String> {
    validate_phrase(&phrase)?;
    Ok(list_sample_files(&samples_dir(&app, &phrase)?).len())
}

#[tauri::command]
pub fn voice_has_model(app: AppHandle, phrase: String) -> Result<bool, String> {
    validate_phrase(&phrase)?;
    Ok(model_path(&app, &phrase)?.is_file())
}

/// Delete all recorded samples and any trained model for a phrase, to start over.
#[tauri::command]
pub fn voice_reset_phrase(app: AppHandle, phrase: String) -> Result<(), String> {
    validate_phrase(&phrase)?;
    let dir = samples_dir(&app, &phrase)?;
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let model = model_path(&app, &phrase)?;
    if model.is_file() {
        std::fs::remove_file(&model).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Record one sample of the user saying `phrase` from the chosen (or
/// default) input device. Runs the actual capture on a blocking thread so
/// the wait doesn't freeze the overlay UI. Emits `voice-recording-level`
/// (0.0-1.0 RMS, ~15/sec) for the duration so the frontend can show a live
/// meter — the only real way for someone to tell "yes, my mic is actually
/// being picked up" before wasting a training attempt on silence.
#[tauri::command]
pub async fn voice_record_sample(
    app: AppHandle,
    phrase: String,
    duration_ms: u64,
    device_name: Option<String>,
) -> Result<(), String> {
    validate_phrase(&phrase)?;
    let duration_ms = duration_ms.clamp(MIN_DURATION_MS, MAX_DURATION_MS);
    let dir = samples_dir(&app, &phrase)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let index = list_sample_files(&dir).len();
    let path = dir.join(format!("sample-{index}.wav"));
    let app_for_recording = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        record_wav(&app_for_recording, &path, duration_ms, &device_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Build a wakeword reference from all recorded samples for `phrase` and save
/// it as a `.rpw` file. Cheap enough (MFCC extraction over a few short clips)
/// to run inline rather than off-thread.
#[tauri::command]
pub fn voice_train_model(app: AppHandle, phrase: String) -> Result<(), String> {
    validate_phrase(&phrase)?;
    let samples = list_sample_files(&samples_dir(&app, &phrase)?);
    if samples.len() < MIN_SAMPLES {
        return Err(format!(
            "Need at least {MIN_SAMPLES} recordings, only found {}",
            samples.len()
        ));
    }
    let wakeword = WakewordRef::new_from_sample_files(
        phrase.clone(),
        None,
        None,
        samples,
        MFCC_SIZE,
    )?;
    let path = model_path(&app, &phrase)?;
    wakeword.save_to_file(path.to_str().ok_or("Invalid model path")?)?;
    Ok(())
}

fn record_wav(
    app: &AppHandle,
    path: &Path,
    duration_ms: u64,
    device_name: &Option<String>,
) -> Result<(), String> {
    let device = resolve_input_device(device_name)?;
    let device_config = device.default_input_config().map_err(|e| e.to_string())?;

    let spec = hound::WavSpec {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate().0,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(Some(writer)));

    let total_samples = ((spec.sample_rate as f32 / 1000.)
        * (duration_ms as f32)
        * spec.channels as f32) as u64;
    let (tx, rx) = mpsc::channel::<()>();
    let stream_config: cpal::StreamConfig = device_config.clone().into();

    let stream = match device_config.sample_format() {
        cpal::SampleFormat::I8 => {
            build_record_stream::<i8>(&device, &stream_config, writer.clone(), tx, total_samples, app.clone())?
        }
        cpal::SampleFormat::I16 => {
            build_record_stream::<i16>(&device, &stream_config, writer.clone(), tx, total_samples, app.clone())?
        }
        cpal::SampleFormat::I32 => {
            build_record_stream::<i32>(&device, &stream_config, writer.clone(), tx, total_samples, app.clone())?
        }
        cpal::SampleFormat::F32 => {
            build_record_stream::<f32>(&device, &stream_config, writer.clone(), tx, total_samples, app.clone())?
        }
        other => return Err(format!("Unsupported microphone sample format: {other:?}")),
    };

    stream.play().map_err(|e| e.to_string())?;
    // Normal path: the callback signals once it's written total_samples. The
    // timeout is only a safety net in case a device under-delivers samples.
    let _ = rx.recv_timeout(std::time::Duration::from_millis(duration_ms + 1500));
    drop(stream);

    writer
        .lock()
        .unwrap()
        .take()
        .ok_or("Recording writer missing")?
        .finalize()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn build_record_stream<T>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    tx: mpsc::Sender<()>,
    total_samples: u64,
    app: AppHandle,
) -> Result<cpal::Stream, String>
where
    T: CpalSample + SizedSample,
    f32: FromSample<T>,
{
    let mut remaining = total_samples;
    // Emit a level roughly 15x/sec rather than every callback (which can fire
    // every few ms) — enough to feel live without spamming IPC from the
    // real-time audio thread.
    let emit_every_samples =
        ((stream_config.sample_rate.0 as u64 * stream_config.channels as u64) / 15).max(1);
    let mut samples_since_emit: u64 = 0;
    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        if remaining == 0 {
            return;
        }
        let mut sum_sq = 0f32;
        let mut count = 0u32;
        if let Ok(mut guard) = writer.try_lock() {
            if let Some(w) = guard.as_mut() {
                for &sample in data {
                    let f: f32 = f32::from_sample(sample);
                    sum_sq += f * f;
                    count += 1;
                    let _ = w.write_sample(f);
                    remaining = remaining.saturating_sub(1);
                    if remaining == 0 {
                        let _ = tx.send(());
                        break;
                    }
                }
            }
        }
        samples_since_emit += count as u64;
        if count > 0 && samples_since_emit >= emit_every_samples {
            samples_since_emit = 0;
            // RMS of a roughly-[-1, 1] float signal — clamp defensively in
            // case a device delivers hotter-than-unity samples.
            let rms = (sum_sq / count as f32).sqrt().min(1.0);
            let _ = app.emit("voice-recording-level", rms);
        }
    };
    let error_callback = |err| eprintln!("voice recording stream error: {err}");
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
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
    // Listen for whichever phrases are trained — not all of them. Lets
    // someone use just "next"/"back" without setting up every build-query
    // phrase too.
    let mut trained: Vec<(String, PathBuf)> = Vec::new();
    for &phrase in PHRASES {
        let path = model_path(&app, phrase)?;
        if path.is_file() {
            trained.push((phrase.to_string(), path));
        }
    }
    if trained.is_empty() {
        return Err("Voice commands haven't been set up yet".to_string());
    }

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        run_listening_thread(app_handle, trained, device_name, ready_tx, stop_rx);
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
    trained: Vec<(String, PathBuf)>,
    device_name: Option<String>,
    ready_tx: mpsc::Sender<Result<(), String>>,
    stop_rx: mpsc::Receiver<()>,
) {
    let stream = match build_listening_stream(&app, &trained, &device_name) {
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

// One fully independent Rustpotter instance per trained phrase, rather than
// one shared instance with every wakeword loaded into it. Rustpotter tracks
// a single cross-wakeword "best candidate" internally (`partial_detection`
// in detector.rs) — wakewords that share a prefix (every phrase here starts
// with "compass ") can end up having one systematically edge out another on
// early, acoustically-ambiguous frames, forcing the loser to out-score the
// winner's stale peak instead of accumulating its own evidence. Feeding the
// same audio into fully separate detectors sidesteps that: each phrase's
// evidence is tracked independently and none of them can starve another.
fn build_listening_stream(
    app: &AppHandle,
    trained: &[(String, PathBuf)],
    device_name: &Option<String>,
) -> Result<cpal::Stream, String> {
    let device = resolve_input_device(device_name)?;
    let device_config = device.default_input_config().map_err(|e| e.to_string())?;
    let bits_per_sample = (device_config.sample_format().sample_size() * 8) as u16;

    let mut config = RustpotterConfig::default();
    config.fmt.sample_rate = device_config.sample_rate().0 as usize;
    config.fmt.channels = device_config.channels();
    config.fmt.sample_format = if device_config.sample_format().is_float() {
        RpSampleFormat::float_of_size(bits_per_sample)
    } else {
        RpSampleFormat::int_of_size(bits_per_sample)
    }
    .ok_or("Unsupported microphone audio format")?;
    config.detector.min_scores = LISTEN_MIN_SCORES;

    let mut detectors: Vec<Rustpotter> = Vec::with_capacity(trained.len());
    for (phrase, path) in trained {
        let mut rp = Rustpotter::new(&config)?;
        rp.add_wakeword_from_file(phrase, path.to_str().ok_or("Invalid model path")?)?;
        detectors.push(rp);
    }

    let stream_config = cpal::StreamConfig {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let app = app.clone();
    match device_config.sample_format() {
        cpal::SampleFormat::I8 => build_spot_stream::<i8>(&device, &stream_config, detectors, app),
        cpal::SampleFormat::I16 => build_spot_stream::<i16>(&device, &stream_config, detectors, app),
        cpal::SampleFormat::I32 => build_spot_stream::<i32>(&device, &stream_config, detectors, app),
        cpal::SampleFormat::F32 => build_spot_stream::<f32>(&device, &stream_config, detectors, app),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn build_spot_stream<S>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    mut detectors: Vec<Rustpotter>,
    app: AppHandle,
) -> Result<cpal::Stream, String>
where
    S: RpSample + SizedSample + Clone,
{
    // Every instance was built from the same config, so their frame size
    // requirement is identical — only need to track one. `detectors` is
    // guaranteed non-empty by the caller (voice_start_listening bails out
    // before spawning this thread if `trained` is empty).
    let samples_per_frame = detectors[0].get_samples_per_frame();
    let mut buffer: Vec<S> = Vec::with_capacity(samples_per_frame * 2);
    let data_callback = move |data: &[S], _: &cpal::InputCallbackInfo| {
        buffer.extend_from_slice(data);
        while buffer.len() >= samples_per_frame {
            let frame: Vec<S> = buffer.drain(0..samples_per_frame).collect();
            for rp in detectors.iter_mut() {
                if let Some(detection) = rp.process_samples(frame.clone()) {
                    let _ = app.emit("voice-command", detection.name.clone());
                }
            }
        }
    };
    let error_callback = |err| eprintln!("voice listening stream error: {err}");
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
}
