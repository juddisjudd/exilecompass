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

/// All loaded wakewords must share one mfcc_size (rustpotter rejects mixed
/// sizes at runtime) — 16 matches rustpotter-cli's own default.
const MFCC_SIZE: u16 = 16;
/// Minimum recordings before a phrase can be trained; rustpotter recommends
/// 3-8 samples per wakeword reference.
const MIN_SAMPLES: usize = 3;
const SAMPLE_DURATION_MS: u64 = 2200;
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
    if phrase == "next" || phrase == "back" {
        Ok(())
    } else {
        Err(format!("Unknown voice phrase: {phrase}"))
    }
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

/// Record one ~2.2s sample of the user saying `phrase` from the default input
/// device. Runs the actual capture on a blocking thread so the ~2.2s wait
/// doesn't freeze the overlay UI.
#[tauri::command]
pub async fn voice_record_sample(app: AppHandle, phrase: String) -> Result<(), String> {
    validate_phrase(&phrase)?;
    let dir = samples_dir(&app, &phrase)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let index = list_sample_files(&dir).len();
    let path = dir.join(format!("sample-{index}.wav"));
    tauri::async_runtime::spawn_blocking(move || record_wav(&path, SAMPLE_DURATION_MS))
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

fn record_wav(path: &Path, duration_ms: u64) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("No microphone found")?;
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
            build_record_stream::<i8>(&device, &stream_config, writer.clone(), tx, total_samples)?
        }
        cpal::SampleFormat::I16 => {
            build_record_stream::<i16>(&device, &stream_config, writer.clone(), tx, total_samples)?
        }
        cpal::SampleFormat::I32 => {
            build_record_stream::<i32>(&device, &stream_config, writer.clone(), tx, total_samples)?
        }
        cpal::SampleFormat::F32 => {
            build_record_stream::<f32>(&device, &stream_config, writer.clone(), tx, total_samples)?
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
) -> Result<cpal::Stream, String>
where
    T: CpalSample + SizedSample,
    f32: FromSample<T>,
{
    let mut remaining = total_samples;
    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        if remaining == 0 {
            return;
        }
        if let Ok(mut guard) = writer.try_lock() {
            if let Some(w) = guard.as_mut() {
                for &sample in data {
                    let f: f32 = f32::from_sample(sample);
                    let _ = w.write_sample(f);
                    remaining = remaining.saturating_sub(1);
                    if remaining == 0 {
                        let _ = tx.send(());
                        break;
                    }
                }
            }
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
) -> Result<(), String> {
    if state.stop_tx.lock().unwrap().is_some() {
        return Ok(()); // already running
    }
    let next_path = model_path(&app, "next")?;
    let back_path = model_path(&app, "back")?;
    if !next_path.is_file() || !back_path.is_file() {
        return Err("Voice commands haven't been set up yet".to_string());
    }

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        run_listening_thread(app_handle, next_path, back_path, ready_tx, stop_rx);
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
    next_path: PathBuf,
    back_path: PathBuf,
    ready_tx: mpsc::Sender<Result<(), String>>,
    stop_rx: mpsc::Receiver<()>,
) {
    let stream = match build_listening_stream(&app, &next_path, &back_path) {
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
    next_path: &Path,
    back_path: &Path,
) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("No microphone found")?;
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

    let mut rustpotter = Rustpotter::new(&config)?;
    rustpotter.add_wakeword_from_file("next", next_path.to_str().ok_or("Invalid model path")?)?;
    rustpotter.add_wakeword_from_file("back", back_path.to_str().ok_or("Invalid model path")?)?;

    let stream_config = cpal::StreamConfig {
        channels: device_config.channels(),
        sample_rate: device_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let app = app.clone();
    match device_config.sample_format() {
        cpal::SampleFormat::I8 => build_spot_stream::<i8>(&device, &stream_config, rustpotter, app),
        cpal::SampleFormat::I16 => build_spot_stream::<i16>(&device, &stream_config, rustpotter, app),
        cpal::SampleFormat::I32 => build_spot_stream::<i32>(&device, &stream_config, rustpotter, app),
        cpal::SampleFormat::F32 => build_spot_stream::<f32>(&device, &stream_config, rustpotter, app),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn build_spot_stream<S>(
    device: &cpal::Device,
    stream_config: &cpal::StreamConfig,
    mut rustpotter: Rustpotter,
    app: AppHandle,
) -> Result<cpal::Stream, String>
where
    S: RpSample + SizedSample,
{
    let samples_per_frame = rustpotter.get_samples_per_frame();
    let mut buffer: Vec<S> = Vec::with_capacity(samples_per_frame * 2);
    let data_callback = move |data: &[S], _: &cpal::InputCallbackInfo| {
        buffer.extend_from_slice(data);
        while buffer.len() >= samples_per_frame {
            let frame: Vec<S> = buffer.drain(0..samples_per_frame).collect();
            if let Some(detection) = rustpotter.process_samples(frame) {
                let _ = app.emit("voice-command", detection.name.clone());
            }
        }
    };
    let error_callback = |err| eprintln!("voice listening stream error: {err}");
    device
        .build_input_stream(stream_config, data_callback, error_callback, None)
        .map_err(|e| e.to_string())
}
