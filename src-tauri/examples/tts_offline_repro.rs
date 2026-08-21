// Exercises offline TTS end to end without the app: loads a Piper (VITS) or
// Kokoro voice directory, synthesizes a sentence, and plays it on the default
// output device.
// Usage: cargo run --example tts_offline_repro -- <voice_dir> [model.onnx] [sid]

use cpal::traits::HostTrait;
use sherpa_onnx::{GenerationConfig, OfflineTts, OfflineTtsConfig};

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = std::path::PathBuf::from(args.next().expect("voice dir"));
    let model = args.next().unwrap_or_else(|| {
        std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .find(|n| n.ends_with(".onnx"))
            .expect("an .onnx model in the voice dir")
    });
    let sid: i32 = args.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();

    let mut config = OfflineTtsConfig::default();
    config.model.provider = Some("cpu".into());
    config.model.num_threads = 2;
    if dir.join("voices.bin").is_file() {
        config.model.kokoro.model = Some(s(dir.join(&model)));
        config.model.kokoro.voices = Some(s(dir.join("voices.bin")));
        config.model.kokoro.tokens = Some(s(dir.join("tokens.txt")));
        config.model.kokoro.data_dir = Some(s(dir.join("espeak-ng-data")));
        println!("kind: kokoro");
    } else {
        config.model.vits.model = Some(s(dir.join(&model)));
        config.model.vits.tokens = Some(s(dir.join("tokens.txt")));
        config.model.vits.data_dir = Some(s(dir.join("espeak-ng-data")));
        println!("kind: vits/piper");
    }

    let t0 = std::time::Instant::now();
    let tts = OfflineTts::create(&config).expect("create offline tts");
    println!("loaded in {:?}; sample_rate={} speakers={}", t0.elapsed(), tts.sample_rate(), tts.num_speakers());

    let gen = GenerationConfig { sid, ..GenerationConfig::default() };
    let t1 = std::time::Instant::now();
    let audio = tts
        .generate_with_config::<fn(&[f32], f32) -> bool>("Compass online. Your first skill is Lightning Arrow.", &gen, None)
        .expect("generate");
    let samples = audio.samples().to_vec();
    println!("generated {} samples ({:.2}s of audio) in {:?}", samples.len(), samples.len() as f32 / audio.sample_rate() as f32, t1.elapsed());

    let device = cpal::default_host().default_output_device().expect("output device");
    let (_stream, handle) = rodio::OutputStream::try_from_device(&device).expect("stream");
    let sink = rodio::Sink::try_new(&handle).expect("sink");
    sink.append(rodio::buffer::SamplesBuffer::new(1, audio.sample_rate() as u32, samples));
    sink.sleep_until_end();
    println!("SUCCESS: played offline TTS output");
}
