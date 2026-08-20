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

const ENABLED_KEY = 'EXILECOMPASS_VOICE_ENABLED_V1';

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _phrases = $state<VoicePhrase[]>([]);
let _enabled = $state(false);
let _listening = $state(false);
let _sampleCounts = $state<Record<VoicePhrase, number>>({});
let _trained = $state<Record<VoicePhrase, boolean>>({});
let _recordingPhrase = $state<VoicePhrase | null>(null);
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

/** Record one sample (~2.2s) of the user saying `phrase`. Resolves once the clip is saved. */
export async function recordVoiceSample(phrase: VoicePhrase): Promise<void> {
  _recordingPhrase = phrase;
  _error = '';
  try {
    await invoke('voice_record_sample', { phrase });
    _sampleCounts[phrase] = await invoke<number>('voice_sample_count', { phrase });
  } catch (e) {
    _error = String(e);
    throw e;
  } finally {
    _recordingPhrase = null;
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
    await invoke('voice_start_listening');
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
