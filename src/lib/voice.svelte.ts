import { invoke } from '@tauri-apps/api/core';

export type VoicePhrase = 'next' | 'back';

const ENABLED_KEY = 'EXILECOMPASS_VOICE_ENABLED_V1';

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _enabled = $state(false);
let _listening = $state(false);
let _sampleCounts = $state<Record<VoicePhrase, number>>({ next: 0, back: 0 });
let _trained = $state<Record<VoicePhrase, boolean>>({ next: false, back: false });
let _recordingPhrase = $state<VoicePhrase | null>(null);
let _error = $state('');

export const voiceState = {
  /** User's saved preference — does not by itself mean the mic is active; see `listening`. */
  get enabled() { return _enabled; },
  /** Whether the detector is actually running right now (drives the "you're being listened to" indicator). */
  get listening() { return _listening; },
  get sampleCounts() { return _sampleCounts; },
  get trained() { return _trained; },
  get setupComplete() { return _trained.next && _trained.back; },
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

export async function refreshVoiceSetupStatus(): Promise<void> {
  for (const phrase of ['next', 'back'] as const) {
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
  if (_listening) await stopVoiceListening();
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
 *  commands on and both phrases are trained, start listening immediately. */
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
