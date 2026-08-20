import { invoke } from '@tauri-apps/api/core';
import { persistGet, persistSet, persistRemove } from '$lib/persist';

// Text-to-speech for voice-command replies. Two backends:
//   - ElevenLabs (bring-your-own-key) if a key is configured — better voice
//     quality, costs the user's own ElevenLabs credits.
//   - Windows SAPI (tts_speak_sapi in Rust) otherwise — free, zero-setup,
//     Windows-only. On Linux with no key configured, speak() will surface
//     whatever error tts_speak_sapi returns (there's no bundled fallback
//     there) rather than fail silently.

export type TtsKeyStorage = 'keychain' | 'fallback' | 'none';

/** A handful of ElevenLabs' stable premade voice ids, so most users don't
 *  need to go find one themselves — Settings also takes a pasted custom id
 *  (e.g. a cloned voice) via the same field. */
export const ELEVENLABS_PRESET_VOICES: { id: string; name: string }[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
];

const FALLBACK_KEY_KEY = 'EXILECOMPASS_ELEVENLABS_KEY_FALLBACK_V1'; // disk (settings.json), plaintext — see keyStorage
const VOICE_ID_KEY = 'EXILECOMPASS_ELEVENLABS_VOICE_ID_V1'; // not sensitive — plain localStorage

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _hasKey = $state(false);
let _keyStorage = $state<TtsKeyStorage>('none');
let _voiceId = $state(ELEVENLABS_PRESET_VOICES[0].id);
let _speaking = $state(false);
let _error = $state('');

export const ttsState = {
  get hasKey() { return _hasKey; },
  /** Where the ElevenLabs key actually ended up — drives the Settings UI's
   *  "not stored in your system keychain" notice when it's 'fallback'. */
  get keyStorage() { return _keyStorage; },
  get voiceId() { return _voiceId; },
  get speaking() { return _speaking; },
  get error() { return _error; },
};

// ── Key management ────────────────────────────────────────────────────────

async function readKeychainKey(): Promise<string | null> {
  try {
    return await invoke<string | null>('tts_get_elevenlabs_key_keychain');
  } catch {
    return null; // no OS keychain reachable (e.g. Linux, no keyring daemon)
  }
}

export async function loadTtsSettings(): Promise<void> {
  const savedVoice = window.localStorage.getItem(VOICE_ID_KEY);
  if (savedVoice) _voiceId = savedVoice;

  const keychainKey = await readKeychainKey();
  if (keychainKey) {
    _hasKey = true;
    _keyStorage = 'keychain';
    return;
  }
  const fallbackKey = await persistGet(FALLBACK_KEY_KEY);
  if (fallbackKey) {
    _hasKey = true;
    _keyStorage = 'fallback';
    return;
  }
  _hasKey = false;
  _keyStorage = 'none';
}

/** Save the key: OS keychain if reachable, otherwise the same local
 *  settings.json every other setting uses (flagged via `keyStorage`). */
export async function setElevenLabsKey(key: string): Promise<void> {
  try {
    await invoke('tts_set_elevenlabs_key_keychain', { key });
    await persistRemove(FALLBACK_KEY_KEY); // drop any stale plaintext copy
    _hasKey = true;
    _keyStorage = 'keychain';
  } catch {
    await persistSet(FALLBACK_KEY_KEY, key);
    _hasKey = true;
    _keyStorage = 'fallback';
  }
}

export async function clearElevenLabsKey(): Promise<void> {
  try { await invoke('tts_delete_elevenlabs_key_keychain'); } catch { /* best effort */ }
  await persistRemove(FALLBACK_KEY_KEY);
  _hasKey = false;
  _keyStorage = 'none';
}

async function getElevenLabsKey(): Promise<string | null> {
  const keychainKey = await readKeychainKey();
  if (keychainKey) return keychainKey;
  return persistGet(FALLBACK_KEY_KEY);
}

export function setVoiceId(id: string) {
  _voiceId = id;
  window.localStorage.setItem(VOICE_ID_KEY, id);
}

// ── Speaking ──────────────────────────────────────────────────────────────

let _audioEl: HTMLAudioElement | null = null;

function playAudioBytes(bytes: number[]): Promise<void> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);
  if (_audioEl) {
    _audioEl.pause();
    URL.revokeObjectURL(_audioEl.src);
  }
  const audio = new Audio(url);
  _audioEl = audio;
  return new Promise<void>((resolve) => {
    const cleanup = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    void audio.play().catch(cleanup);
  });
}

/** Speak `text` aloud — ElevenLabs if a key is configured, otherwise the free
 *  Windows SAPI fallback. Errors are recorded on `ttsState.error` rather than
 *  thrown, since this is normally fired from a background voice-command
 *  detection with nothing to catch the rejection. */
export async function speak(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  _error = '';
  _speaking = true;
  try {
    const key = await getElevenLabsKey();
    if (key) {
      const bytes = await invoke<number[]>('tts_speak_elevenlabs', {
        text: trimmed,
        apiKey: key,
        voiceId: _voiceId,
      });
      await playAudioBytes(bytes);
    } else {
      await invoke('tts_speak_sapi', { text: trimmed });
    }
  } catch (e) {
    _error = String(e);
  } finally {
    _speaking = false;
  }
}
