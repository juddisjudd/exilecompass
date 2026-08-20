import { invoke } from '@tauri-apps/api/core';

export type VoicePhrase = string;

/** Category grouping for the Settings UI — purely a display concern, the
 *  backend's PHRASES registry (voice.rs) is a flat list. Keep in sync with it:
 *  any id present there but missing here falls into 'other' automatically. */
export type VoicePhraseGroup =
  | 'objectives'
  | 'navigation'
  | 'buildInfo'
  | 'equipment'
  | 'timer'
  | 'overlay'
  | 'other';

const GROUP_MAP: Record<string, VoicePhraseGroup> = {
  next: 'objectives',
  back: 'objectives',
  rewards: 'navigation',
  campaign: 'navigation',
  build: 'navigation',
  timer: 'navigation',
  skill1: 'buildInfo',
  skill2: 'buildInfo',
  skill3: 'buildInfo',
  skill4: 'buildInfo',
  skill5: 'buildInfo',
  skills: 'buildInfo',
  spirit: 'buildInfo',
  skill1supports: 'buildInfo',
  skill2supports: 'buildInfo',
  skill3supports: 'buildInfo',
  skill4supports: 'buildInfo',
  skill5supports: 'buildInfo',
  spiritsupports: 'buildInfo',
  weapon: 'equipment',
  helmet: 'equipment',
  bodyarmour: 'equipment',
  gloves: 'equipment',
  boots: 'equipment',
  amulet: 'equipment',
  rings: 'equipment',
  belt: 'equipment',
  uniques: 'equipment',
  flasks: 'equipment',
  charms: 'equipment',
  buildinfo: 'buildInfo',
  weaponstats: 'equipment',
  helmetstats: 'equipment',
  bodyarmourstats: 'equipment',
  glovesstats: 'equipment',
  bootsstats: 'equipment',
  amuletstats: 'equipment',
  ringsstats: 'equipment',
  beltstats: 'equipment',
  timerstart: 'timer',
  timerstop: 'timer',
  timerreset: 'timer',
  timerstatus: 'timer',
  timersplit: 'timer',
  timermodemanual: 'timer',
  timermodecampaign: 'timer',
  clickthroughon: 'overlay',
  clickthroughoff: 'overlay',
};

export function voicePhraseGroup(phrase: VoicePhrase): VoicePhraseGroup {
  return GROUP_MAP[phrase] ?? 'other';
}

/** The literal (always-English) phrase each id listens for — not
 *  translatable content, it's the fixed wake-phrase baked into the bundled
 *  keyword-spotting model (resources/kws/keywords.txt) regardless of UI
 *  locale. Shown in Settings purely as documentation now — there's no
 *  recording step left to attach it to, the model ships ready to use. */
export const VOICE_PHRASE_EXAMPLES: Record<string, string> = {
  next: 'compass next',
  back: 'compass back',
  rewards: 'compass rewards',
  campaign: 'compass campaign',
  build: 'compass build',
  timer: 'compass timer',
  skill1: 'compass first skill',
  skill2: 'compass second skill',
  skill3: 'compass third skill',
  skill4: 'compass fourth skill',
  skill5: 'compass fifth skill',
  skills: 'compass skills',
  spirit: 'compass spirit gems',
  skill1supports: 'compass first skill supports',
  skill2supports: 'compass second skill supports',
  skill3supports: 'compass third skill supports',
  skill4supports: 'compass fourth skill supports',
  skill5supports: 'compass fifth skill supports',
  spiritsupports: 'compass spirit gem supports',
  weapon: 'compass weapon',
  helmet: 'compass helmet',
  bodyarmour: 'compass body armour',
  gloves: 'compass gloves',
  boots: 'compass boots',
  amulet: 'compass amulet',
  rings: 'compass rings',
  belt: 'compass belt',
  uniques: 'compass uniques',
  flasks: 'compass flasks',
  charms: 'compass charms',
  buildinfo: 'compass build info',
  weaponstats: 'compass weapon stats',
  helmetstats: 'compass helmet stats',
  bodyarmourstats: 'compass body armour stats',
  glovesstats: 'compass gloves stats',
  bootsstats: 'compass boots stats',
  amuletstats: 'compass amulet stats',
  ringsstats: 'compass rings stats',
  beltstats: 'compass belt stats',
  timerstart: 'compass start timer',
  timerstop: 'compass stop timer',
  timerreset: 'compass reset timer',
  timerstatus: 'compass run time',
  timersplit: 'compass split',
  timermodemanual: 'compass manual timer',
  timermodecampaign: 'compass campaign timer',
  clickthroughon: 'compass click through on',
  clickthroughoff: 'compass click through off',
};

const ENABLED_KEY = 'EXILECOMPASS_VOICE_ENABLED_V1';
const INPUT_DEVICE_KEY = 'EXILECOMPASS_VOICE_INPUT_DEVICE_V1';

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

/** Load the saved enable preference and device/phrase lists at startup —
 *  deliberately does NOT auto-start listening even if the preference is on.
 *  A prior version did; a failure inside the native listener (a real crash,
 *  not just a Rust-level error — see voice.rs's threading notes) then means
 *  every future launch immediately retries the same crashing call before the
 *  user can ever reach Settings to turn it back off. Requiring an explicit
 *  toggle each session is a small UX cost for a much safer failure mode: a
 *  bug in this feature can no longer take down the whole app's ability to
 *  start. */
export async function applyVoiceEnabledOnStartup(): Promise<void> {
  loadVoiceEnabled();
  await loadVoiceInputDevices();
  await loadVoicePhrases();
}

/** Toggle from Settings. Starts/stops the actual listener to match. */
export async function setVoiceEnabled(value: boolean): Promise<void> {
  setVoiceEnabledPref(value);
  if (value) {
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
