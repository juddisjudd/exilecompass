export type HotkeyActionId =
  | 'toggleClickThrough'
  | 'refreshStatus'
  | 'toggleSettings';

export interface HotkeyAction {
  id: HotkeyActionId;
  description: string;
  defaultCombo: string;
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: 'toggleClickThrough', description: 'Toggle click-through mode', defaultCombo: 'Ctrl+Shift+C' },
  { id: 'refreshStatus', description: 'Refresh game detection', defaultCombo: 'Ctrl+Shift+R' },
  { id: 'toggleSettings', description: 'Toggle settings panel', defaultCombo: 'Ctrl+Shift+Comma' },
];

const STORAGE_KEY = 'EXILECOMPASS_HOTKEYS_V1';

export type HotkeyBindings = Record<HotkeyActionId, string>;

function normalizeKeyToken(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (!t) {
    return null;
  }

  if (t === ',' || t === 'comma') return 'Comma';
  if (t === '.' || t === 'period' || t === 'dot') return 'Period';
  if (t === 'space' || t === 'spacebar') return 'Space';
  if (t === 'esc' || t === 'escape') return 'Escape';
  if (t === 'enter' || t === 'return') return 'Enter';
  if (t === 'tab') return 'Tab';

  if (t.length === 1) {
    return t.toUpperCase();
  }

  if (/^f([1-9]|1[0-2])$/.test(t)) {
    return t.toUpperCase();
  }

  return token.trim();
}

export function normalizeHotkeyCombo(input: string): string | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  const tokens = raw
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  let key: string | null = null;

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower === 'ctrl' || lower === 'control') {
      ctrl = true;
      continue;
    }
    if (lower === 'shift') {
      shift = true;
      continue;
    }
    if (lower === 'alt' || lower === 'option') {
      alt = true;
      continue;
    }
    if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'win') {
      meta = true;
      continue;
    }

    const normalizedKey = normalizeKeyToken(token);
    if (!normalizedKey || key) {
      return null;
    }
    key = normalizedKey;
  }

  if (!key) {
    return null;
  }

  const parts: string[] = [];
  if (ctrl) parts.push('Ctrl');
  if (shift) parts.push('Shift');
  if (alt) parts.push('Alt');
  if (meta) parts.push('Meta');
  parts.push(key);

  return parts.join('+');
}

function getEventKeyToken(event: KeyboardEvent): string {
  const key = event.key;

  if (key === ',') return 'Comma';
  if (key === '.') return 'Period';
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  if (key.length === 1) return key.toUpperCase();

  return key;
}

export function hotkeyMatchesEvent(event: KeyboardEvent, combo: string): boolean {
  const normalized = normalizeHotkeyCombo(combo);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  const expectedCtrl = modifiers.has('Ctrl');
  const expectedShift = modifiers.has('Shift');
  const expectedAlt = modifiers.has('Alt');
  const expectedMeta = modifiers.has('Meta');

  if (event.ctrlKey !== expectedCtrl) return false;
  if (event.shiftKey !== expectedShift) return false;
  if (event.altKey !== expectedAlt) return false;
  if (event.metaKey !== expectedMeta) return false;

  return getEventKeyToken(event) === key;
}

export function getDefaultHotkeyBindings(): HotkeyBindings {
  return HOTKEY_ACTIONS.reduce((acc, action) => {
    acc[action.id] = action.defaultCombo;
    return acc;
  }, {} as HotkeyBindings);
}

export function loadHotkeyBindings(): HotkeyBindings {
  const defaults = getDefaultHotkeyBindings();

  if (typeof window === 'undefined') {
    return defaults;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<HotkeyActionId, string>>;
    const merged = { ...defaults };

    for (const action of HOTKEY_ACTIONS) {
      const value = parsed[action.id];
      if (typeof value === 'string') {
        const normalized = normalizeHotkeyCombo(value);
        if (normalized) {
          merged[action.id] = normalized;
        }
      }
    }

    return merged;
  } catch {
    return defaults;
  }
}

export function saveHotkeyBindings(bindings: HotkeyBindings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}
