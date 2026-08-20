# Keyword-spotting model

Source: [`sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01`](https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models)
(k2-fsa/sherpa-onnx), licensed Apache License 2.0. Zipformer transducer, 3.3M
params, trained on GigaSpeech (English, 10,000 hours). `encoder.onnx`/`decoder.onnx`/`joiner.onnx`
are the `epoch-12-avg-2-chunk-16-left-64.int8.onnx` files from that release;
`tokens.txt` is unmodified from the same release. All three must come from the
same release variant — an earlier bundle mixed the `-mobile` release's encoder
with this release's decoder/joiner, which crashed the whole app (native ONNX
Reshape abort, uncatchable across FFI) on the first decode. Verify any swap
with `cargo run --example kws_repro` before shipping.

`keywords.txt` is **not** from upstream — it's ExileCompass's own compass
phrase list, generated from `keywords_raw.txt` (see `voice.rs`'s module docs
for the exact phrase set) via the official conversion tool. Each line's
`@display` name is deliberately the same lowercase id used everywhere else in
the app (`voice.rs`'s `PHRASES`, the frontend dispatch table) — `result.keyword`
from `KeywordSpotter::get_result()` comes back as exactly that string, so
there's no separate translation table to keep in sync:

```
uvx --with click --with sentencepiece --with pypinyin --from sherpa-onnx sherpa-onnx-cli text2token \
  --tokens tokens.txt --tokens-type bpe --bpe-model <bpe.model from the same release> \
  keywords_raw.txt keywords.txt
```

Re-run that (with an updated `keywords_raw.txt`) any time the phrase set
changes — `bpe.model` itself isn't bundled here since it's only needed for
that one-time offline generation step, not at runtime.
