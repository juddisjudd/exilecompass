// Overlay color theme. Themes remap the shared `--c-*` tokens (app.css) via a
// `data-theme` attribute on <html>; "default" clears the attribute. Cosmetic
// preference, so plain localStorage — same tier as click-through opacity.

export type ThemeId = 'default' | 'abyss' | 'breach' | 'ritual' | 'vaal' | 'mono';

const KEY = 'EXILECOMPASS_THEME_V1';

// Labels are PoE league names (proper nouns) — deliberately not localized.
// Swatches feed the settings picker: bg, panel, accent, text.
export const THEMES: { id: ThemeId; label: string; swatches: string[] }[] = [
  { id: 'default', label: 'Default', swatches: ['#0b0a08', '#171310', '#960018', '#ede6d5'] },
  { id: 'abyss', label: 'Abyss', swatches: ['#090c0a', '#0f1912', '#35bb58', '#dfece1'] },
  { id: 'breach', label: 'Breach', swatches: ['#100b14', '#1f1228', '#a347ef', '#efe8f5'] },
  { id: 'ritual', label: 'Ritual', swatches: ['#0c0808', '#200e0f', '#ad0445', '#9c9086'] },
  { id: 'vaal', label: 'Vaal', swatches: ['#0f0a09', '#22100f', '#c21628', '#a98e60'] },
  { id: 'mono', label: 'Mono', swatches: ['#0a0a0a', '#161616', '#9e9e9e', '#ffffff'] },
];

let _theme = $state<ThemeId>('default');

export const theme = {
  get current(): ThemeId {
    return _theme;
  },
};

function apply(t: ThemeId) {
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
  apply(_theme);
}

export function setTheme(t: ThemeId) {
  _theme = t;
  apply(t);
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* storage full / blocked */
  }
}
