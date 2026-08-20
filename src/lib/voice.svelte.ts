import { invoke } from '@tauri-apps/api/core';

export type VoicePhrase = string;

/** Category grouping for the Settings UI — purely a display concern, the
 *  backend's PHRASES registry (voice.rs) is a flat list. Keep in sync with it:
 *  any id present there but missing here falls into 'other' automatically. */
export type VoicePhraseGroup = 'objectives' | 'navigation' | 'buildInfo' | 'other';

const GROUP_MAP: Record<string, VoicePhraseGroup> = {
  next: 'objectives',
  back: 'objectives',
  rewards: 'navigation',
  campaign: 'navigation',
  build: 'navigation',
  skill1: 'buildInfo',
  skill2: 'buildInfo',
  skill3: 'buildInfo',
  spirit: 'buildInfo',
  skill1supports: 'buildInfo',
  skill2supports: 'buildInfo',
  skill3supports: 'buildInfo',
  spiritsupports: 'buildInfo',
};

export function voicePhraseGroup(phrase: VoicePhrase): VoicePhraseGroup {
  return GROUP_MAP[phrase] ?? 'other';
}

/** The literal (always-English) phrase to say for each id — not translatable
 *  content, it's the fixed wake-phrase this feature is built around
 *  regardless of UI locale. Also drives the per-phrase recording duration
 *  below, since it's the only place word count is known. */
export const VOICE_PHRASE_EXAMPLES: Record<string, string> = {
  next: 'compass next',
  back: 'compass back',
  rewards: 'compass rewards',
  campaign: 'compass campaign',
  build: 'compass build',
  skill1: 'compass first skill',
  skill2: 'compass second skill',
  skill3: 'compass third skill',
  spirit: 'compass spirit gem',
  skill1supports: 'compass first skill supports',
  skill2supports: 'compass second skill supports',
  skill3supports: 'compass third skill supports',
  spiritsupports: 'compass spirit gem supports',
};

/** Recording window scaled to roughly how long the phrase takes to say.
 *  A single fixed ~2.2s window used to apply to every phrase regardless of
 *  length — fine for "compass next", but it silently truncated the longer
 *  build-info phrases mid-sentence on every single recording, so nothing
 *  trained from them could ever detect reliably. The Rust side still clamps
 *  this to a sane range regardless (see MIN/MAX_DURATION_MS in voice.rs). */
function phraseDurationMs(phrase: VoicePhrase): number {
  const words = (VOICE_PHRASE_EXAMPLES[phrase] ?? phrase).split(/\s+/).filter(Boolean).length || 1;
  return Math.round(1400 + words * 450);
}

const ENABLED_KEY = 'EXILECOMPASS_VOICE_ENABLED_V1';
const INPUT_DEVICE_KEY = 'EXILECOMPASS_VOICE_INPUT_DEVICE_V1';

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _phrases = $state<VoicePhrase[]>([]);
let _enabled = $state(false);
let _listening = $state(false);
let _sampleCounts = $state<Record<VoicePhrase, number>>({});
let _trained = $state<Record<VoicePhrase, boolean>>({});
let _recordingPhrase = $state<VoicePhrase | null>(null);
let _recordingLevel = $state(0);
let _inputDevices = $state<string[]>([]);
let _selectedDevice = $state<string | null>(null);
let _error = $state('');

export const voiceState = {
  /** Every phrase id the backend knows how to train/listen for (voice.rs's PHRASES). */
  get phrases() { return _phrases; },
  /** User's saved preference — does not by itself mean the mic is active; see `listening`. */
  get enabled() { return _enabled; },
  /** Whether the detector is actually running right now (drives the "you're being listened to" indicator). */
  get listening() { return _listening; },
  get sampleCounts() { return _sampleCounts; },
  get trained() { return _trained; },
  /** At least one phrase trained — matches the backend, which listens for
   *  whichever phrases are trained rather than requiring the full set. */
  get setupComplete() { return _phrases.some((p) => _trained[p]); },
  get recordingPhrase() { return _recordingPhrase; },
  /** 0.0-1.0 live input level while recordingPhrase is set — the actual
   *  answer to "is my mic being picked up," rather than just hoping. */
  get recordingLevel() { return _recordingLevel; },
  get inputDevices() { return _inputDevices; },
  /** null = OS default device. */
  get selectedDevice() { return _selectedDevice; },
  get error() { return _error; },
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

/** Called from the `voice-recording-level` Tauri event. */
export function setVoiceRecordingLevel(level: number) {
  _recordingLevel = level;
}

// ── Setup: recording samples & training ──────────────────────────────────────

export async function loadVoicePhrases(): Promise<VoicePhrase[]> {
  _phrases = await invoke<string[]>('voice_list_phrases');
  return _phrases;
}

export async function refreshVoiceSetupStatus(): Promise<void> {
  if (_phrases.length === 0) await loadVoicePhrases();
  for (const phrase of _phrases) {
    _sampleCounts[phrase] = await invoke<number>('voice_sample_count', { phrase });
    _trained[phrase] = await invoke<boolean>('voice_has_model', { phrase });
  }
}

/** Record one sample of the user saying `phrase` (duration scaled to its
 *  length — see phraseDurationMs). Resolves once the clip is saved;
 *  `voiceState.recordingLevel` updates live for the duration via the
 *  `voice-recording-level` event. */
export async function recordVoiceSample(phrase: VoicePhrase): Promise<void> {
  _recordingPhrase = phrase;
  _recordingLevel = 0;
  _error = '';
  try {
    await invoke('voice_record_sample', {
      phrase,
      durationMs: phraseDurationMs(phrase),
      deviceName: _selectedDevice,
    });
    _sampleCounts[phrase] = await invoke<number>('voice_sample_count', { phrase });
  } catch (e) {
    _error = String(e);
    throw e;
  } finally {
    _recordingPhrase = null;
    _recordingLevel = 0;
  }
}

export async function trainVoicePhrase(phrase: VoicePhrase): Promise<void> {
  _error = '';
  try {
    await invoke('voice_train_model', { phrase });
    _trained[phrase] = true;
  } catch (e) {
    _error = String(e);
    throw e;
  }
}

/** Delete all recordings + the trained model for `phrase`, to start over. */
export async function resetVoicePhrase(phrase: VoicePhrase): Promise<void> {
  await invoke('voice_reset_phrase', { phrase });
  _sampleCounts[phrase] = 0;
  _trained[phrase] = false;
  // The backend just re-derives its trained-phrase list from disk on next
  // start, so a live session doesn't need restarting for one phrase reset —
  // only stop if that was the last trained phrase (nothing left to listen for).
  if (_listening && !voiceState.setupComplete) await stopVoiceListening();
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
}

/** Called from the `voice-listening-stopped` Tauri event so the indicator
 *  stays honest if the backend thread stops itself. */
export function markVoiceListeningStopped() {
  _listening = false;
}

/** Apply the saved enable preference at startup: if the user left voice
 *  commands on and at least one phrase is trained, start listening immediately. */
export async function applyVoiceEnabledOnStartup(): Promise<void> {
  loadVoiceEnabled();
  await loadVoiceInputDevices();
  await refreshVoiceSetupStatus();
  if (_enabled && voiceState.setupComplete) {
    try { await startVoiceListening(); } catch { /* surfaced via voiceState.error */ }
  }
}

/** Toggle from Settings. Starts/stops the actual listener to match. */
export async function setVoiceEnabled(value: boolean): Promise<void> {
  setVoiceEnabledPref(value);
  if (value) {
    if (!voiceState.setupComplete) return; // UI gates the toggle on setupComplete already
    await startVoiceListening();
  } else {
    await stopVoiceListening();
  }
}

/** Re-apply the (possibly just-changed) selected input device to a live
 *  listening session — stop/start, since the stream is built once at start. */
export async function restartVoiceListeningForDeviceChange(): Promise<void> {
  if (!_listening) return;
  await stopVoiceListening();
  await startVoiceListening();
}
