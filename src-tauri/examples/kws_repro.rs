// Standalone crash repro for the KWS model — no mic needed, feeds silence.
// Usage: cargo run --example kws_repro [model_dir]

use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};

fn main() {
    let dir = std::env::args()
        .nth(1)
        .unwrap_or_else(|| concat!(env!("CARGO_MANIFEST_DIR"), "/resources/kws").to_string());
    println!("model dir: {dir}");

    let p = |name: &str| -> String { format!("{dir}/{name}") };
    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder = Some(p("encoder.onnx"));
    config.model_config.transducer.decoder = Some(p("decoder.onnx"));
    config.model_config.transducer.joiner = Some(p("joiner.onnx"));
    config.model_config.tokens = Some(p("tokens.txt"));
    config.model_config.provider = Some("cpu".to_string());
    config.keywords_file = Some(p("keywords.txt"));
    config.num_trailing_blanks = 6;

    let kws = KeywordSpotter::create(&config).expect("create keyword spotter");
    println!("spotter created OK");

    let stream = kws.create_stream();
    let chunk = vec![0.0f32; 1600]; // 100ms of silence at 16kHz
    for i in 0..50 {
        stream.accept_waveform(16000, &chunk);
        while kws.is_ready(&stream) {
            kws.decode(&stream);
            if let Some(r) = kws.get_result(&stream) {
                if !r.keyword.is_empty() {
                    println!("detected: {}", r.keyword);
                    kws.reset(&stream);
                }
            }
        }
        if i % 10 == 0 {
            println!("fed {}ms OK", (i + 1) * 100);
        }
    }
    println!("SUCCESS: 5s of audio decoded without crashing");
}
