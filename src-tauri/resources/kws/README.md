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
phrase list, generated from `keywords_raw.txt` (committed here; ids must match
`voice.rs`'s `PHRASES`) via the official conversion tool. Multiple spoken forms
may map to one `@id` (e.g. "spirit gem"/"spirit gems"). Each line's
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
that one-time offline generation step, not at runtime. A spoken form whose
every word is already a whole token in `tokens.txt` (e.g. `▁FIND`) can be
added to `keywords.txt` by hand without the tool.

## Checking recognition offline

`tools/kws-eval/synth.ps1` renders every line of `keywords_raw.txt` (plus a
few decoy sentences) to WAV with the Windows voices, and
`cargo run --release --example kws_eval -- <wav dir>` feeds them through the
app's real spotter config and capture-side DSP (`audio.rs`), reporting hits
per phrase, wrong-phrase detections and false alarms. Synthetic speech is not
a microphone, but it catches phrases the model systematically can't hear and
any regression in the DSP. Run it after editing the keyword files or touching
`audio.rs`/`voice.rs`; `--keywords <file>`, `--paths <n>` and
`--threshold <f>` let you A/B a change without editing the bundled files.

What it has shown so far (two voices, 126 phrase clips, 24 decoys):

- `max_active_paths` 4 → 8 took recognition from 115/126 to 120/126 with no
  false alarms and no measurable decode-speed cost, which is why `voice.rs`
  runs 8. Sherpa's default of 4 is sized for a couple of short wake words.
- Per-keyword boosts (`:1.5`/`:2.0` on the longer phrases, which the sherpa
  docs suggest for hard-to-trigger keywords) made things *worse* here
  (117/126): boosted long phrases crowd short ones like "compass build" out
  of the beam. Don't add them without re-measuring.
- Feeding 48 kHz audio through the resampler gives the same result as native
  16 kHz clips, so the capture path itself isn't costing recognition.
- "compass stash"/"compass regex" are the weakest phrases (1/4); "compass
  find" (2/2) was added as another spoken form for the same tab.
