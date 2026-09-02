import { invoke } from '@tauri-apps/api/core';
import { warmSystemVoice } from '$lib/tts.svelte';

// Phrase metadata (groups, spoken examples, label keys) lives in the rune-free
// voicePhrases.ts so the docs generator can import it; re-exported here for
// existing importers.
export {
  VOICE_GROUP_ORDER, VOICE_GROUP_LABEL_KEYS, VOICE_PHRASE_GROUPS, VOICE_PHRASE_EXAMPLES,
  VOICE_PHRASE_LABEL_KEYS, voicePhraseGroup,
} from './voicePhrases';
export type { VoicePhrase, VoicePhraseGroup } from './voicePhrases';
import type { VoicePhrase } from './voicePhrases';

const ENABLED_KEY = 'EXILECOMPASS_VOICE_ENABLED_V1';
const INPUT_DEVICE_KEY = 'EXILECOMPASS_VOICE_INPUT_DEVICE_V1';
const SENSITIVITY_KEY = 'EXILECOMPASS_VOICE_SENSITIVITY_V1';
export const VOICE_SENSITIVITY_MIN = 1;
export const VOICE_SENSITIVITY_MAX = 8;
const VOICE_SENSITIVITY_DEFAULT = 5;

/** dBFS range the Settings meter spans, and the band normal speech should
 *  land in after the capture-side AGC (audio.rs) has done its lifting. */
export const VOICE_METER_FLOOR_DB = -60;
export const VOICE_METER_TARGET_DB: readonly [number, number] = [-30, -12];
const METER_RELEASE_DB_PER_TICK = 6;
const PEAK_HOLD_MS = 1500;
const PEAK_FALL_DB_PER_TICK = 2;
/** Set just before the startup auto-start, cleared once it returns. Found
 *  still set on the next launch ⇒ starting the listener took the whole app
 *  down (a native crash never reaches our catch), so don't retry blindly. */
const STARTING_MARKER_KEY = 'EXILECOMPASS_VOICE_STARTING_V1';

/** How long the footer indicator stays "just heard something" green after a
 *  detection, before fading back to idle-red. Sherpa's KeywordSpotter only
 *  reports pass/fail on an actual match — unlike rustpotter, there's no
 *  continuously-building confidence score to react to earlier, so this pulses
 *  reactively off the `voice-command` event itself rather than tracking
 *  "getting close." */
const DETECTED_PULSE_MS = 1800;
/** The same phrase reported again this soon after itself is the model
 *  re-confirming one utterance (an alternate spelling of it, a stutter), not
 *  a second command — "compass next" must never complete two objectives. */
const DUPLICATE_WINDOW_MS = 700;
/** Retry spacing after the listener stops on its own (stream error, stalled
 *  device); a re-plugged headset or a driver reset is usually back within
 *  seconds. Exhausting the list leaves the error showing in Settings. */
const RESTART_DELAYS_MS = [1500, 4000, 10000];
/** A session that stays up this long counts as healthy and resets the retry
 *  budget, so a flapping device can't loop forever on the shortest delay. */
const RESTART_HEALTHY_MS = 30_000;

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _phrases = $state<VoicePhrase[]>([]);
let _enabled = $state(false);
let _listening = $state(false);
let _micLevel = $state(0);
let _meterDb = $state(VOICE_METER_FLOOR_DB);
let _peakDb = $state(VOICE_METER_FLOOR_DB);
let _peakHoldUntil = 0;
let _inputDevices = $state<string[]>([]);
let _selectedDevice = $state<string | null>(null);
let _sensitivity = $state(VOICE_SENSITIVITY_DEFAULT);
let _recentlyDetected = $state(false);
let _lastDetectedPhrase = $state<VoicePhrase | null>(null);
let _lastDetectedAt = 0;
let _error = $state('');
let _disabledAfterCrash = $state(false);
let _detectedPulseTimer: ReturnType<typeof setTimeout> | undefined;
let _stopRequested = false;
let _restartAttempt = 0;
let _restartTimer: ReturnType<typeof setTimeout> | undefined;
let _healthyTimer: ReturnType<typeof setTimeout> | undefined;

export const voiceState = {
  /** Every phrase id the bundled model can recognize (voice.rs's PHRASES). */
  get phrases() { return _phrases; },
  /** User's saved preference — does not by itself mean the mic is active; see `listening`. */
  get enabled() { return _enabled; },
  /** Whether the detector is actually running right now (drives the "you're being listened to" indicator). */
  get listening() { return _listening; },
  /** 0.0-1.0 live mic input level while listening — the practical "is my mic
   *  even being picked up" signal, independent of whether anything's
   *  actually being recognized. */
  get micLevel() { return _micLevel; },
  /** Smoothed level in dBFS (fast attack, slow release) for the Settings meter. */
  get meterDb() { return _meterDb; },
  /** Peak-hold marker in dBFS. */
  get peakDb() { return _peakDb; },
  get inputDevices() { return _inputDevices; },
  /** null = OS default device. */
  get selectedDevice() { return _selectedDevice; },
  /** 1 (strict) … 8 (eager); maps onto sherpa's keywords_threshold. */
  get sensitivity() { return _sensitivity; },
  /** True for a couple seconds right after a phrase fires — drives the
   *  footer indicator's red→green pulse. */
  get recentlyDetected() { return _recentlyDetected; },
  get lastDetectedPhrase() { return _lastDetectedPhrase; },
  get error() { return _error; },
  /** True when this launch refused to auto-start because the previous launch
   *  crashed while starting the listener. Cleared once the user re-enables. */
  get disabledAfterCrash() { return _disabledAfterCrash; },
};

// ── Persisted enable preference ──────────────────────────────────────────────

export function loadVoiceEnabled(): boolean {
  _enabled = window.localStorage.getItem(ENABLED_KEY) === '1';
  return _enabled;
}

function setVoiceEnabledPref(value: boolean) {
  _enabled = value;
  window.localStorage.setItem(ENABLED_KEY, value ? '1' : '0');
}

// ── Input device selection ───────────────────────────────────────────────────

export async function loadVoiceInputDevices(): Promise<void> {
  try {
    _inputDevices = await invoke<string[]>('voice_list_input_devices');
  } catch (e) {
    _error = String(e);
    return;
  }
  const saved = window.localStorage.getItem(INPUT_DEVICE_KEY);
  // Only honor the saved pick if that device is still actually present —
  // otherwise silently fall back to the OS default rather than erroring on
  // a headset that's since been unplugged.
  _selectedDevice = saved && _inputDevices.includes(saved) ? saved : null;
}

export function setVoiceInputDevice(name: string | null) {
  _selectedDevice = name;
  if (name) window.localStorage.setItem(INPUT_DEVICE_KEY, name);
  else window.localStorage.removeItem(INPUT_DEVICE_KEY);
}

// ── Sensitivity ───────────────────────────────────────────────────────────────

function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return VOICE_SENSITIVITY_DEFAULT;
  return Math.min(VOICE_SENSITIVITY_MAX, Math.max(VOICE_SENSITIVITY_MIN, Math.round(value)));
}

export function loadVoiceSensitivity(): number {
  const raw = window.localStorage.getItem(SENSITIVITY_KEY);
  _sensitivity = raw === null ? VOICE_SENSITIVITY_DEFAULT : clampSensitivity(Number(raw));
  return _sensitivity;
}

/** Persists only — call restartVoiceListening() once the user lets go of the
 *  slider, since the threshold is baked into the spotter at start. */
export function setVoiceSensitivity(value: number) {
  _sensitivity = clampSensitivity(value);
  window.localStorage.setItem(SENSITIVITY_KEY, String(_sensitivity));
}

// 5 → sherpa's 0.25 default; each step is 0.05 of threshold.
function keywordsThreshold(): number {
  return 0.5 - 0.05 * _sensitivity;
}

/** Called from the `voice-recording-level` Tauri event (name kept from
 *  before this became a listening-time meter rather than a recording-time
 *  one — see voice.rs). Values are quantized so mic noise that rounds to the
 *  same reading doesn't re-render the footer indicator 15 times a second. */
export function setVoiceMicLevel(level: number) {
  _micLevel = Math.round(level * 100) / 100;
  const raw = level > 0 ? Math.max(VOICE_METER_FLOOR_DB, 20 * Math.log10(level)) : VOICE_METER_FLOOR_DB;
  const db = Math.round(raw * 2) / 2;
  _meterDb = db >= _meterDb ? db : Math.max(db, _meterDb - METER_RELEASE_DB_PER_TICK);
  const now = performance.now();
  if (db >= _peakDb) {
    _peakDb = db;
    _peakHoldUntil = now + PEAK_HOLD_MS;
  } else if (now > _peakHoldUntil) {
    _peakDb = Math.max(db, _peakDb - PEAK_FALL_DB_PER_TICK);
  }
}

/** 0–100 position of a dBFS value on the Settings meter. */
export function voiceMeterPct(db: number): number {
  const clamped = Math.min(0, Math.max(VOICE_METER_FLOOR_DB, db));
  return ((clamped - VOICE_METER_FLOOR_DB) / -VOICE_METER_FLOOR_DB) * 100;
}

function resetMeter() {
  _micLevel = 0;
  _meterDb = VOICE_METER_FLOOR_DB;
  _peakDb = VOICE_METER_FLOOR_DB;
}

export async function loadVoicePhrases(): Promise<VoicePhrase[]> {
  _phrases = await invoke<string[]>('voice_list_phrases');
  return _phrases;
}

// ── Live listening ────────────────────────────────────────────────────────

function cancelRestart() {
  if (_restartTimer) clearTimeout(_restartTimer);
  _restartTimer = undefined;
}

export async function startVoiceListening(): Promise<void> {
  _error = '';
  _stopRequested = false;
  cancelRestart();
  try {
    await invoke('voice_start_listening', { deviceName: _selectedDevice, keywordsThreshold: keywordsThreshold() });
    _listening = true;
  } catch (e) {
    _error = String(e);
    _listening = false;
    throw e;
  }
  if (_healthyTimer) clearTimeout(_healthyTimer);
  _healthyTimer = setTimeout(() => { _restartAttempt = 0; }, RESTART_HEALTHY_MS);
  warmSystemVoice();
}

export async function stopVoiceListening(): Promise<void> {
  _stopRequested = true;
  cancelRestart();
  await invoke('voice_stop_listening');
  _listening = false;
  resetMeter();
}

/** Called from the `voice-listening-stopped` Tauri event so the indicator
 *  stays honest if the backend thread stops itself. A non-empty `reason`
 *  means the capture failed rather than being asked to stop; while the
 *  preference is still on, that gets a few spaced retries. */
export function markVoiceListeningStopped(reason = '') {
  _listening = false;
  resetMeter();
  if (!reason || _stopRequested) return;
  _error = reason;
  if (_enabled) scheduleRestart();
}

function scheduleRestart() {
  if (_restartTimer) return;
  const delay = RESTART_DELAYS_MS[_restartAttempt];
  if (delay === undefined) return;
  _restartAttempt += 1;
  _restartTimer = setTimeout(async () => {
    _restartTimer = undefined;
    if (_listening || !_enabled || _stopRequested) return;
    try {
      await startVoiceListening();
    } catch {
      scheduleRestart();
    }
  }, delay);
}

/** Called from the `voice-command` Tauri event with the phrase the model
 *  reported. Returns false when the event is a duplicate of one just handled
 *  (see DUPLICATE_WINDOW_MS); otherwise records it and pulses
 *  `recentlyDetected` for DETECTED_PULSE_MS. */
export function acceptVoiceCommand(phrase: VoicePhrase): boolean {
  const now = performance.now();
  if (phrase === _lastDetectedPhrase && now - _lastDetectedAt < DUPLICATE_WINDOW_MS) return false;
  _lastDetectedAt = now;
  _lastDetectedPhrase = phrase;
  _recentlyDetected = true;
  if (_detectedPulseTimer) clearTimeout(_detectedPulseTimer);
  _detectedPulseTimer = setTimeout(() => {
    _recentlyDetected = false;
  }, DETECTED_PULSE_MS);
  return true;
}

/** Startup: load the saved preference and device/phrase lists, then resume
 *  listening if it was on. Guarded by STARTING_MARKER_KEY so a listener that
 *  crashes the process can't relaunch-loop — after one bad start the
 *  preference is switched off and `disabledAfterCrash` explains why. */
export async function applyVoiceEnabledOnStartup(): Promise<void> {
  loadVoiceEnabled();
  loadVoiceSensitivity();
  await loadVoiceInputDevices();
  await loadVoicePhrases();
  if (!_enabled) return;

  if (window.localStorage.getItem(STARTING_MARKER_KEY)) {
    window.localStorage.removeItem(STARTING_MARKER_KEY);
    setVoiceEnabledPref(false);
    _disabledAfterCrash = true;
    return;
  }

  window.localStorage.setItem(STARTING_MARKER_KEY, '1');
  try {
    await startVoiceListening();
  } catch {
    setVoiceEnabledPref(false);
  } finally {
    window.localStorage.removeItem(STARTING_MARKER_KEY);
  }
}

/** Turn voice commands on/off. The preference is only persisted as "on"
 *  after the listener actually started, so the saved state never claims
 *  more than what's running. */
export async function setVoiceEnabled(value: boolean): Promise<void> {
  if (value) {
    await startVoiceListening();
    setVoiceEnabledPref(true);
    _disabledAfterCrash = false;
  } else {
    await stopVoiceListening();
    setVoiceEnabledPref(false);
  }
}

export async function toggleVoiceEnabled(): Promise<void> {
  await setVoiceEnabled(!_listening);
}

/** Re-apply a changed device/sensitivity to a live listening session —
 *  stop/start, since both are baked in at start. No-op when not listening. */
export async function restartVoiceListening(): Promise<void> {
  if (!_listening) return;
  await stopVoiceListening();
  await startVoiceListening();
}

export const restartVoiceListeningForDeviceChange = restartVoiceListening;
