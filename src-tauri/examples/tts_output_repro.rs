// Exercises the TTS output path without the app: lists output devices, then
// plays 300ms of a quiet tone on the default device via rodio.
// Usage: cargo run --example tts_output_repro

use cpal::traits::{DeviceTrait, HostTrait};

fn main() {
    let host = cpal::default_host();
    let names: Vec<String> = host
        .output_devices()
        .expect("enumerate output devices")
        .filter_map(|d| d.name().ok())
        .collect();
    println!("output devices ({}):", names.len());
    for n in &names {
        println!("  - {n}");
    }

    let device = host.default_output_device().expect("default output device");
    println!("default: {}", device.name().unwrap_or_default());

    // 300ms 440Hz sine, 16-bit mono 16kHz, as an in-memory WAV.
    let sr = 16_000u32;
    let n = (sr as f32 * 0.3) as usize;
    let mut pcm = Vec::with_capacity(n * 2);
    for i in 0..n {
        let s = (i as f32 / sr as f32 * 440.0 * std::f32::consts::TAU).sin() * 0.1;
        pcm.extend_from_slice(&((s * i16::MAX as f32) as i16).to_le_bytes());
    }
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&sr.to_le_bytes());
    wav.extend_from_slice(&(sr * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    wav.extend_from_slice(&pcm);

    let (_stream, handle) = rodio::OutputStream::try_from_device(&device).expect("open output stream");
    let sink = rodio::Sink::try_new(&handle).expect("sink");
    sink.append(rodio::Decoder::new(std::io::Cursor::new(wav)).expect("decode wav"));
    sink.sleep_until_end();
    println!("SUCCESS: played 300ms tone via rodio on the default device");
}
