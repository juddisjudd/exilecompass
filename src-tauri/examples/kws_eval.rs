// Offline recognition check for the bundled phrase list — no microphone
// needed. Feeds synthesized WAVs (tools/kws-eval/synth.ps1 renders every line
// of keywords_raw.txt with the Windows voices, plus decoy sentences) through
// the same spotter config and audio conditioning the app uses, and reports
// hits/misses per phrase and false alarms. Run it after editing the keyword
// files or touching audio.rs/voice.rs:
//
//   cargo run --release --example kws_eval -- <wav dir> [--threshold 0.25]
//       [--paths 8] [--keywords <file>] [--model-dir <dir>] [--no-agc] [-v]
//
// File names are `<id>__<voice>__<phrase>.wav`; id `none` marks a decoy.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Instant;

use exilecompass_lib::audio::{Agc, Resampler};
use exilecompass_lib::voice::{spotter_config, DEFAULT_KEYWORDS_THRESHOLD, KWS_SAMPLE_RATE};
use sherpa_onnx::{KeywordSpotter, Wave};

#[derive(Default)]
struct Tally {
    hits: usize,
    total: usize,
    misses: Vec<String>,
}

fn main() {
    let mut wav_dir: Option<PathBuf> = None;
    let mut threshold = DEFAULT_KEYWORDS_THRESHOLD;
    let mut paths: Option<i32> = None;
    let mut keywords: Option<String> = None;
    let mut model_dir = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/kws"));
    let mut use_agc = true;
    let mut verbose = false;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--threshold" => threshold = args.next().and_then(|v| v.parse().ok()).expect("--threshold <f32>"),
            "--paths" => paths = Some(args.next().and_then(|v| v.parse().ok()).expect("--paths <n>")),
            "--keywords" => keywords = Some(args.next().expect("--keywords <file>")),
            "--model-dir" => model_dir = PathBuf::from(args.next().expect("--model-dir <dir>")),
            "--no-agc" => use_agc = false,
            "-v" => verbose = true,
            other => wav_dir = Some(PathBuf::from(other)),
        }
    }
    let wav_dir = wav_dir.expect("usage: kws_eval <wav dir> [options]");

    let mut config = spotter_config(&model_dir, threshold).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1);
    });
    if let Some(p) = paths {
        config.max_active_paths = p;
    }
    if let Some(k) = keywords {
        config.keywords_file = Some(k);
    }
    println!(
        "threshold {} · max_active_paths {} · trailing blanks {} · agc {} · keywords {}",
        config.keywords_threshold,
        config.max_active_paths,
        config.num_trailing_blanks,
        use_agc,
        config.keywords_file.as_deref().unwrap_or("?")
    );
    let kws = KeywordSpotter::create(&config).expect("create keyword spotter");

    let mut files: Vec<PathBuf> = std::fs::read_dir(&wav_dir)
        .expect("read wav dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("wav")).unwrap_or(false))
        .collect();
    files.sort();

    let mut per_id: BTreeMap<String, Tally> = BTreeMap::new();
    let mut wrong: Vec<String> = Vec::new();
    let mut false_alarms: Vec<String> = Vec::new();
    let mut decoys = 0usize;
    let mut audio_secs = 0f64;
    let started = Instant::now();

    for path in &files {
        let stem = path.file_stem().unwrap().to_string_lossy().into_owned();
        let expected = stem.split("__").next().unwrap_or("").to_string();
        let Some(wave) = Wave::read(&path.to_string_lossy()) else {
            eprintln!("skipping unreadable {}", path.display());
            continue;
        };
        let rate = wave.sample_rate() as u32;
        let mut samples = wave.samples().to_vec();
        audio_secs += samples.len() as f64 / rate as f64;
        // Trailing silence so the confirmation blanks after the last token can
        // arrive, as they would from a live mic.
        samples.extend(std::iter::repeat(0.0).take(rate as usize));

        let detected = run_one(&kws, &samples, rate, use_agc);
        if verbose {
            println!("{stem}: {detected:?}");
        }
        if expected == "none" {
            decoys += 1;
            if !detected.is_empty() {
                false_alarms.push(format!("{stem} -> {detected:?}"));
            }
            continue;
        }
        let tally = per_id.entry(expected.clone()).or_default();
        tally.total += 1;
        if detected.iter().any(|d| *d == expected) {
            tally.hits += 1;
        } else {
            tally.misses.push(stem.clone());
        }
        for d in detected.iter().filter(|d| **d != expected) {
            wrong.push(format!("{stem} -> {d}"));
        }
    }
    let elapsed = started.elapsed().as_secs_f64();

    println!("\n{:<20} {:>5}", "phrase id", "hits");
    let (mut hits, mut total) = (0, 0);
    for (id, t) in &per_id {
        hits += t.hits;
        total += t.total;
        let mark = if t.hits == t.total { " " } else { "!" };
        println!("{mark}{id:<19} {:>2}/{:<2} {}", t.hits, t.total, t.misses.join(", "));
    }
    println!("\nrecognized {hits}/{total} ({:.1}%)", 100.0 * hits as f64 / total.max(1) as f64);
    println!("wrong-phrase detections: {}", wrong.len());
    for w in &wrong {
        println!("  {w}");
    }
    println!("false alarms on decoys: {}/{decoys}", false_alarms.len());
    for f in &false_alarms {
        println!("  {f}");
    }
    println!("decode speed: {:.1}x realtime ({audio_secs:.0} s of audio in {elapsed:.1} s)", audio_secs / elapsed.max(1e-9));
}

fn run_one(kws: &KeywordSpotter, samples: &[f32], rate: u32, use_agc: bool) -> Vec<String> {
    let stream = kws.create_stream();
    let mut resampler = Resampler::new(rate, KWS_SAMPLE_RATE);
    let mut agc = Agc::new(rate);
    let frame = (rate / 100).max(1) as usize; // 10 ms, like cpal's callbacks
    let mut detected = Vec::new();
    for chunk in samples.chunks(frame) {
        let mut buf = chunk.to_vec();
        if use_agc {
            agc.process(&mut buf);
        }
        let out = resampler.process(&buf);
        if out.is_empty() {
            continue;
        }
        stream.accept_waveform(KWS_SAMPLE_RATE as i32, &out);
        while kws.is_ready(&stream) {
            kws.decode(&stream);
            if let Some(r) = kws.get_result(&stream) {
                if !r.keyword.is_empty() {
                    detected.push(r.keyword);
                    kws.reset(&stream);
                }
            }
        }
    }
    detected
}
