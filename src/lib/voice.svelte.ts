import { invoke } from '@tauri-apps/api/core';

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

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _phrases = $state<VoicePhrase[]>([]);
let _enabled = $state(false);
let _listening = $state(false);
let _micLevel = $state(0);
let _inputDevices = $state<string[]>([]);
let _selectedDevice = $state<string | null>(null);
let _recentlyDetected = $state(false);
let _lastDetectedPhrase = $state<VoicePhrase | null>(null);
let _error = $state('');
let _disabledAfterCrash = $state(false);
let _detectedPulseTimer: ReturnType<typeof setTimeout> | undefined;

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
  get inputDevices() { return _inputDevices; },
  /** null = OS default device. */
  get selectedDevice() { return _selectedDevice; },
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

/** Called from the `voice-recording-level` Tauri event (name kept from
 *  before this became a listening-time meter rather than a recording-time
 *  one — see voice.rs). */
export function setVoiceMicLevel(level: number) {
  _micLevel = level;
}

export async function loadVoicePhrases(): Promise<VoicePhrase[]> {
  _phrases = await invoke<string[]>('voice_list_phrases');
  return _phrases;
}

// ── Live listening ────────────────────────────────────────────────────────

export async function startVoiceListening(): Promise<void> {
  _error = '';
  try {
    await invoke('voice_start_listening', { deviceName: _selectedDevice });
    _listening = true;
  } catch (e) {
    _error = String(e);
    _listening = false;
    throw e;
  }
}

export async function stopVoiceListening(): Promise<void> {
  await invoke('voice_stop_listening');
  _listening = false;
  _micLevel = 0;
}

/** Called from the `voice-listening-stopped` Tauri event so the indicator
 *  stays honest if the backend thread stops itself. */
export function markVoiceListeningStopped() {
  _listening = false;
  _micLevel = 0;
}

/** Called from the `voice-command` Tauri event — records which phrase fired
 *  and pulses `recentlyDetected` for DETECTED_PULSE_MS. */
export function markVoiceCommandDetected(phrase: VoicePhrase) {
  _lastDetectedPhrase = phrase;
  _recentlyDetected = true;
  if (_detectedPulseTimer) clearTimeout(_detectedPulseTimer);
  _detectedPulseTimer = setTimeout(() => {
    _recentlyDetected = false;
  }, DETECTED_PULSE_MS);
}

/** Startup: load the saved preference and device/phrase lists, then resume
 *  listening if it was on. Guarded by STARTING_MARKER_KEY so a listener that
 *  crashes the process can't relaunch-loop — after one bad start the
 *  preference is switched off and `disabledAfterCrash` explains why. */
export async function applyVoiceEnabledOnStartup(): Promise<void> {
  loadVoiceEnabled();
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

/** Re-apply the (possibly just-changed) selected input device to a live
 *  listening session — stop/start, since the stream is built once at start. */
export async function restartVoiceListeningForDeviceChange(): Promise<void> {
  if (!_listening) return;
  await stopVoiceListening();
  await startVoiceListening();
}
