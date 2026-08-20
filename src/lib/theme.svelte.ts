// Overlay color theme. Themes remap the shared `--c-*` tokens (app.css) via a
// `data-theme` attribute on <html>; "default" clears the attribute. Cosmetic
// preference, so plain localStorage is the source of truth for the main
// window — same tier as click-through opacity.
//
// Widget windows are a separate process/document (their own <html>, no shared
// state with this module's in-memory _theme) and never ran loadTheme() at
// all, so they always rendered the Default palette regardless of the saved
// theme. setTheme() also mirrors the choice to persist.ts (disk) + an
// `ec-theme-changed` event, the same "predates opening + live while open"
// bridge every other cross-window widget need uses (see CLAUDE.md's Secondary
// overlay widget windows section) — WidgetShell.svelte consumes both.

import { persistSet } from '$lib/persist';
import { emit } from '@tauri-apps/api/event';

export type ThemeId = 'default' | 'abyss' | 'breach' | 'ritual' | 'vaal' | 'aldur' | 'mono';

const KEY = 'EXILECOMPASS_THEME_V1';

// Labels are PoE league names (proper nouns) — deliberately not localized.
// Swatches feed the settings picker: bg, panel, accent, text.
export const THEMES: { id: ThemeId; label: string; swatches: string[] }[] = [
  { id: 'default', label: 'Default', swatches: ['#0a0a0a', '#121212', '#b5102d', '#ededed'] },
  { id: 'abyss', label: 'Abyss', swatches: ['#090c0a', '#0f1912', '#35bb58', '#dfece1'] },
  { id: 'breach', label: 'Breach', swatches: ['#100b14', '#1f1228', '#a347ef', '#efe8f5'] },
  { id: 'ritual', label: 'Ritual', swatches: ['#0c0808', '#200e0f', '#ad0445', '#9c9086'] },
  { id: 'vaal', label: 'Vaal', swatches: ['#0f0a09', '#22100f', '#c21628', '#a98e60'] },
  { id: 'aldur', label: 'Aldur', swatches: ['#070b14', '#0a1628', '#127eee', '#e4ecf5'] },
  { id: 'mono', label: 'Mono', swatches: ['#0a0a0a', '#161616', '#9e9e9e', '#ffffff'] },
];

let _theme = $state<ThemeId>('default');

export const theme = {
  get current(): ThemeId {
    return _theme;
  },
};

/** Apply a theme's `data-theme` attribute to the current document. Exported
 *  so widget windows (their own separate <html>) can apply a theme they
 *  learn about via persist.ts/`ec-theme-changed` without duplicating this
 *  attribute logic — see WidgetShell.svelte. */
export function applyTheme(t: ThemeId) {
  if (t === 'default') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/** Restore the saved theme (if any) and apply it. Call once on startup. */
export function loadTheme() {
  try {
    const raw = window.localStorage.getItem(KEY) as ThemeId | null;
    if (raw && THEMES.some((t) => t.id === raw)) _theme = raw;
  } catch {
    /* ignore corrupt state */
  }
  applyTheme(_theme);
  // Mirror to disk on every startup, not just on an explicit change — closes
  // the gap for installs that picked a theme before this widget-facing copy
  // existed, with no separate migration needed.
  void persistSet(KEY, _theme);
}

export function setTheme(t: ThemeId) {
  _theme = t;
  applyTheme(t);
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* storage full / blocked */
  }
  void persistSet(KEY, t);
  void emit('ec-theme-changed', { theme: t });
}
