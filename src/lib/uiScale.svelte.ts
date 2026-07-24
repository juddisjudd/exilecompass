// Overlay-wide UI scale ("font size" in Settings → Appearance).
//
// Implemented via WebView2's native zoom (`Webview.setZoom`, Tauri's wrapper
// around `ICoreWebView2Controller::put_ZoomFactor`) rather than a CSS-level
// trick. Two CSS approaches were tried and rejected first:
//   - Root `font-size`: most component styles here are authored in px, not
//     rem, so it wouldn't touch padding/icons/widths — text would grow out
//     of sync with its containers.
//   - CSS `zoom` on <html>: unlike real browser/engine zoom, the non-standard
//     `zoom` property scales an element's rendered box in its *parent's*
//     coordinate space without shrinking the effective viewport `vw`/`vh`
//     resolve against — so `.app-shell`'s `100vw`/`100vh` (sized to the real
//     window) then got scaled *again* on top of that, overflowing past the
//     window edges and clipping at any scale > 100%.
// Native `setZoom` is the same mechanism as Ctrl+Scroll browser zoom: it
// reflows the page into a smaller virtual viewport first, then composites
// that at full size, so `vw`/`vh`/`position: fixed` all stay correctly
// pinned to the real window with no overflow. Requires the
// `core:webview:allow-set-webview-zoom` permission (src-tauri/capabilities/default.json).
// Main window only — secondary widget windows (widgets.ts) aren't covered.
// Cosmetic preference, so plain localStorage — same tier as theme.svelte.ts.

import { getCurrentWebview } from '@tauri-apps/api/webview';

export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.3;
export const UI_SCALE_STEP = 0.05;
export const UI_SCALE_DEFAULT = 1;

const KEY = 'EXILECOMPASS_UI_SCALE_V1';

let _scale = $state(UI_SCALE_DEFAULT);

export const uiScale = {
  get current(): number {
    return _scale;
  },
};

function clamp(v: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, v));
}

function apply(v: number) {
  void getCurrentWebview().setZoom(v);
}

/** Restore the saved scale (if any) and apply it. Call once on startup. */
export function loadUiScale() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed)) _scale = clamp(parsed);
    }
  } catch {
    /* ignore corrupt state */
  }
  apply(_scale);
}

export function setUiScale(v: number) {
  _scale = clamp(v);
  apply(_scale);
  try {
    window.localStorage.setItem(KEY, String(_scale));
  } catch {
    /* storage full / blocked */
  }
}
