// Auto-hide trigger keys.
//
// Game keybinds (e.g. `i`, `u`, `p`, `Ctrl+U`, `m`) that auto-hide the overlay
// while you play, so it never sits over the inventory/map/skills panels. A
// low-level keyboard hook in the Rust backend observes these without consuming
// them — the game still receives the keystroke. See src-tauri/overlay-core.
//
// Combos are stored in the same "Ctrl+Shift+Key" form as hotkeys.ts and the
// final key token is resolved here to a Windows virtual-key code before being
// handed to the backend.

import { normalizeHotkeyCombo } from './hotkeys';

export type TriggerMode = 'hideOnly' | 'toggle';

export interface TriggerConfig {
  /** hideOnly: triggers only hide (show via the hide/show hotkey).
   *  toggle: each press flips hidden/shown. */
  mode: TriggerMode;
  /** Normalized combos, e.g. "I", "Ctrl+U", "M". */
  keys: string[];
}

/** A trigger resolved for the Rust backend (key → Windows virtual-key code). */
export interface TriggerChord {
  vk: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

const STORAGE_KEY = 'EXILECOMPASS_TRIGGERS_V1';

export function getDefaultTriggerConfig(): TriggerConfig {
  return { mode: 'hideOnly', keys: ['I', 'U', 'P', 'Ctrl+U', 'M'] };
}

/** Map a normalized key token (the last part of a combo) to a Windows VK code. */
function keyTokenToVk(key: string): number | null {
  // Single character: A–Z and 0–9 map directly to their VK code.
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39)) {
      return code;
    }
    return null;
  }

  // Function keys F1–F12 → 0x70–0x7B.
  const fMatch = /^F([1-9]|1[0-2])$/.exec(key);
  if (fMatch) {
    return 0x70 + (Number(fMatch[1]) - 1);
  }

  switch (key) {
    case 'Comma':
      return 0xbc;
    case 'Period':
      return 0xbe;
    case 'Space':
      return 0x20;
    case 'Enter':
      return 0x0d;
    case 'Tab':
      return 0x09;
    case 'Escape':
      return 0x1b;
    default:
      return null;
  }
}

/** Convert a user combo (e.g. "Ctrl+U") into a backend chord, or null if invalid. */
export function comboToChord(combo: string): TriggerChord | null {
  const normalized = normalizeHotkeyCombo(combo);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  const vk = keyTokenToVk(key);
  if (vk === null) {
    return null;
  }

  return {
    vk,
    ctrl: modifiers.has('Ctrl'),
    shift: modifiers.has('Shift'),
    alt: modifiers.has('Alt'),
  };
}

/** Resolve a config's keys to backend chords, dropping any that don't map. */
export function configToChords(config: TriggerConfig): TriggerChord[] {
  return config.keys
    .map(comboToChord)
    .filter((c): c is TriggerChord => c !== null);
}

export function loadTriggerConfig(): TriggerConfig {
  const defaults = getDefaultTriggerConfig();

  if (typeof window === 'undefined') {
    return defaults;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TriggerConfig>;
    const mode: TriggerMode = parsed.mode === 'toggle' ? 'toggle' : 'hideOnly';
    const keys = Array.isArray(parsed.keys)
      ? parsed.keys
          .map((k) => normalizeHotkeyCombo(String(k)))
          .filter((k): k is string => k !== null)
      : defaults.keys;
    return { mode, keys };
  } catch {
    return defaults;
  }
}

export function saveTriggerConfig(config: TriggerConfig): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
