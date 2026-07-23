import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { persistGet, persistSet } from '$lib/persist';

// Secondary overlay widget windows (Act-Decoder, PoB tree HUD, macro wheel,
// Labyrinth tracker, ...). Every widget window label must start with
// "widget-" — the Rust `create_widget_window` command and the `widget-*`
// Tauri capability both key off that prefix.

export function widgetLabel(id: string): string {
  return `widget-${id}`;
}

function widgetPositionKey(label: string): string {
  return `EXILECOMPASS_WIDGET_POS_V1_${label}`;
}

interface WidgetPosition {
  x: number;
  y: number;
}

async function loadWidgetPosition(label: string): Promise<WidgetPosition | null> {
  try {
    const raw = await persistGet(widgetPositionKey(label));
    return raw ? (JSON.parse(raw) as WidgetPosition) : null;
  } catch {
    return null;
  }
}

/** Open a widget window (or focus it if already open). `id` is the widget
 *  content id read by the `/widget` route (e.g. "act-decoder"); the window
 *  label is derived from it via `widgetLabel`. */
export async function openWidget(id: string): Promise<void> {
  const label = widgetLabel(id);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const saved = await loadWidgetPosition(label);
  await invoke('create_widget_window', {
    label,
    widget: id,
    x: saved?.x ?? null,
    y: saved?.y ?? null,
  });
}

export async function closeWidget(id: string): Promise<void> {
  const win = await WebviewWindow.getByLabel(widgetLabel(id));
  await win?.close();
}

export async function isWidgetOpen(id: string): Promise<boolean> {
  return (await WebviewWindow.getByLabel(widgetLabel(id))) !== null;
}

/** Toggle a widget window: open it if closed, close it if open. Mirrors
 *  Exile-UI's per-widget hotkey behavior (one press shows, another hides). */
export async function toggleWidget(id: string): Promise<void> {
  const win = await WebviewWindow.getByLabel(widgetLabel(id));
  if (win) {
    await win.close();
  } else {
    await openWidget(id);
  }
}

// Opacity lives in Settings (main window), not in the widget's own chrome —
// a widget window is a separate process with no shared JS memory with the
// main window, so a live change has to cross via a Tauri event, same pattern
// as Act-Decoder's zone tracking (levelingRoute.svelte.ts / +page.svelte).

export function widgetOpacityKey(id: string): string {
  return `EXILECOMPASS_WIDGET_OPACITY_V1_${widgetLabel(id)}`;
}

export async function getWidgetOpacity(id: string): Promise<number> {
  const raw = await persistGet(widgetOpacityKey(id));
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isNaN(parsed) ? 1 : parsed;
}

/** Persists the new opacity and, if the widget window is currently open,
 *  updates it live via `ec-widget-opacity` (WidgetShell.svelte listens). */
export async function setWidgetOpacity(id: string, value: number): Promise<void> {
  await persistSet(widgetOpacityKey(id), String(value));
  await emit('ec-widget-opacity', { label: widgetLabel(id), opacity: value });
}

/** Apply the same click-through state to every open widget window — called
 *  alongside the main window's toggle so the whole overlay (main + widgets)
 *  stays in sync under one hotkey, since each widget's click-through state is
 *  otherwise independent of the main window's. */
export async function syncWidgetClickThrough(enabled: boolean): Promise<void> {
  const windows = await getAllWebviewWindows();
  for (const win of windows) {
    if (win.label.startsWith('widget-')) {
      try {
        await win.setIgnoreCursorEvents(enabled);
      } catch {
        /* best effort */
      }
    }
  }
}
