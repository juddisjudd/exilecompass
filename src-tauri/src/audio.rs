//! Capture-side audio conditioning shared by the live voice listener
//! (voice.rs) and the offline `kws_eval` example, so both hand the keyword
//! model identically prepared 16 kHz mono audio.

use std::f64::consts::PI;

// Boost-only AGC: quiet mics get lifted toward the level the model was trained
// on; loud ones are left alone. Slow release so gain doesn't pump between words.
const AGC_TARGET_PEAK: f32 = 0.3;
const AGC_MAX_GAIN: f32 = 4.0;
const AGC_RELEASE_SECS: f32 = 3.0;
const AGC_FLOOR: f32 = 0.01;

pub struct Agc {
    sample_rate: f32,
    envelope: f32,
    gain: f32,
}

impl Agc {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate: sample_rate as f32, envelope: 0.0, gain: 1.0 }
    }

    /// Applies gain in place and returns the post-gain RMS (0..=1).
    pub fn process(&mut self, samples: &mut [f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let peak = samples.iter().fold(0f32, |m, s| m.max(s.abs()));
        let release = (-(samples.len() as f32) / (AGC_RELEASE_SECS * self.sample_rate)).exp();
        self.envelope = peak.max(self.envelope * release);
        if self.envelope > AGC_FLOOR {
            let target = (AGC_TARGET_PEAK / self.envelope).clamp(1.0, AGC_MAX_GAIN);
            // Fast attack, slow release: a louder buffer pulls the gain down at
            // once, so the first syllable after a quiet stretch isn't clipped
            // by boost left over from the silence before it.
            self.gain = if target < self.gain { target } else { self.gain + (target - self.gain) * 0.2 };
        }
        let mut sum_sq = 0f32;
        for s in samples.iter_mut() {
            *s = (*s * self.gain).clamp(-1.0, 1.0);
            sum_sq += *s * *s;
        }
        (sum_sq / samples.len() as f32).sqrt().min(1.0)
    }
}

/// Filter half-width in output samples; scaled by the rate ratio so the
/// transition band is the same fraction of the output bandwidth whatever the
/// device rate.
const HALF_WIDTH_OUT: f64 = 12.0;
/// Cutoff as a fraction of the lower of the two Nyquist frequencies.
const CUTOFF_FRACTION: f64 = 0.9;
const TABLE_OVERSAMPLE: usize = 32;

/// Sample-rate converter with a windowed-sinc low-pass evaluated at every
/// output instant (the approach of Kaldi's LinearResample). Plain linear
/// interpolation, used before, folds everything above the output Nyquist
/// (8 kHz at 16 kHz) back into the speech band — which smears exactly the
/// fricatives ("compaSS", "Stash", "Skill") the model keys on.
pub struct Resampler {
    /// Input samples per output sample.
    step: f64,
    /// Filter half-width in input samples.
    half: usize,
    /// Kernel sampled every 1/TABLE_OVERSAMPLE input samples, for x >= 0.
    table: Vec<f32>,
    /// `half` samples of look-back followed by not-yet-consumed input.
    buf: Vec<f32>,
    /// Next output instant, in `buf` coordinates.
    pos: f64,
    passthrough: bool,
}

impl Resampler {
    pub fn new(in_rate: u32, out_rate: u32) -> Self {
        if in_rate == out_rate || in_rate == 0 || out_rate == 0 {
            return Self { step: 1.0, half: 0, table: Vec::new(), buf: Vec::new(), pos: 0.0, passthrough: true };
        }
        let step = in_rate as f64 / out_rate as f64;
        let half = (HALF_WIDTH_OUT * step.max(1.0)).ceil() as usize;
        // Cycles per input sample.
        let cutoff = 0.5 * CUTOFF_FRACTION * (in_rate.min(out_rate) as f64 / in_rate as f64);
        let table = (0..half * TABLE_OVERSAMPLE + 2)
            .map(|i| kernel(i as f64 / TABLE_OVERSAMPLE as f64, cutoff, half as f64) as f32)
            .collect();
        Self { step, half, table, buf: vec![0.0; half], pos: half as f64, passthrough: false }
    }

    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if self.passthrough {
            return input.to_vec();
        }
        if input.is_empty() {
            return Vec::new();
        }
        self.buf.extend_from_slice(input);
        let half = self.half as f64;
        let last = (self.buf.len() - 1) as f64;
        let mut out = Vec::with_capacity((input.len() as f64 / self.step) as usize + 2);
        while self.pos + half <= last {
            let lo = (self.pos - half).ceil().max(0.0) as usize;
            let hi = (self.pos + half).floor() as usize;
            let mut acc = 0f32;
            for (k, &sample) in self.buf[lo..=hi].iter().enumerate() {
                let d = ((lo + k) as f64 - self.pos).abs() * TABLE_OVERSAMPLE as f64;
                let i = d as usize;
                let frac = (d - i as f64) as f32;
                acc += sample * (self.table[i] + (self.table[i + 1] - self.table[i]) * frac);
            }
            out.push(acc);
            self.pos += self.step;
        }
        let consumed = (self.pos - half).floor().max(0.0) as usize;
        if consumed > 0 {
            self.buf.drain(..consumed);
            self.pos -= consumed as f64;
        }
        out
    }
}

fn kernel(x: f64, cutoff: f64, half: f64) -> f64 {
    if x >= half {
        return 0.0;
    }
    let sinc = if x == 0.0 { 1.0 } else { let a = 2.0 * PI * cutoff * x; a.sin() / a };
    let window = 0.42 + 0.5 * (PI * x / half).cos() + 0.08 * (2.0 * PI * x / half).cos();
    2.0 * cutoff * sinc * window
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(rate: u32, hz: f64, amplitude: f32, secs: f64) -> Vec<f32> {
        (0..(rate as f64 * secs) as usize)
            .map(|i| amplitude * (2.0 * PI * hz * i as f64 / rate as f64).sin() as f32)
            .collect()
    }

    fn run(r: &mut Resampler, input: &[f32], chunk: usize) -> Vec<f32> {
        input.chunks(chunk).flat_map(|c| r.process(c)).collect()
    }

    fn peak(v: &[f32]) -> f32 {
        v.iter().fold(0f32, |m, s| m.max(s.abs()))
    }

    #[test]
    fn passband_tone_keeps_amplitude_and_length() {
        let input = tone(48000, 1000.0, 1.0, 1.0);
        let out = run(&mut Resampler::new(48000, 16000), &input, 480);
        assert!((out.len() as i64 - 16000).abs() <= 40, "len {}", out.len());
        let p = peak(&out[1600..]);
        assert!((0.95..=1.05).contains(&p), "peak {p}");
    }

    #[test]
    fn tone_above_output_nyquist_is_suppressed() {
        let input = tone(48000, 12000.0, 1.0, 1.0);
        let out = run(&mut Resampler::new(48000, 16000), &input, 480);
        let p = peak(&out[1600..]);
        assert!(p < 0.02, "aliased peak {p}");
    }

    #[test]
    fn output_is_independent_of_chunking() {
        let input = tone(44100, 700.0, 0.8, 0.5);
        let a = run(&mut Resampler::new(44100, 16000), &input, 441);
        let b = run(&mut Resampler::new(44100, 16000), &input, 333);
        assert!((a.len() as i64 - b.len() as i64).abs() <= 1);
        let n = a.len().min(b.len());
        let diff = a[..n].iter().zip(&b[..n]).fold(0f32, |m, (x, y)| m.max((x - y).abs()));
        assert!(diff < 1e-5, "max diff {diff}");
    }

    #[test]
    fn equal_rates_pass_through() {
        let input = tone(16000, 500.0, 0.5, 0.1);
        assert_eq!(Resampler::new(16000, 16000).process(&input), input);
    }

    #[test]
    fn agc_boosts_quiet_input_without_clipping_a_loud_onset() {
        let mut agc = Agc::new(48000);
        let quiet = tone(48000, 300.0, 0.05, 2.0);
        let mut last_peak = 0f32;
        for frame in quiet.chunks(480) {
            let mut f = frame.to_vec();
            agc.process(&mut f);
            last_peak = peak(&f);
        }
        assert!(last_peak > 0.15, "quiet input not boosted: {last_peak}");
        let mut loud = tone(48000, 300.0, 0.9, 0.01);
        agc.process(&mut loud);
        let p = peak(&loud);
        assert!(p < 1.0 && p > 0.85, "onset peak {p}");
    }
}
