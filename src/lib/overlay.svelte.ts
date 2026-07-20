import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface WindowInfo {
  hwnd: number;
  title: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface OverlayStatus {
  attached: boolean;
  clickThrough: boolean;
  gameRunning: boolean;
  /** True on platforms that can't attach to the game window (non-Windows). The
   *  UI runs as a standalone companion: no "waiting for game" gate. */
  standalone: boolean;
  /** Whether the window was created transparent. False on Linux by default, so
   *  the UI fills the backdrop opaque and squares the corners (no white edges). */
  transparent: boolean;
}

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _status = $state<OverlayStatus>({
  attached: false,
  clickThrough: false,
  gameRunning: false,
  standalone: false,
  // Default true so Windows never flashes an opaque backdrop before the first
  // status read; Linux flips it to false on the first poll.
  transparent: true,
});

// Fully-hidden state — distinct from click-through. When hidden the overlay
// window is removed entirely (no rendering, no input capture).
let _hidden = $state(false);

export const overlayState = {
  get attached() { return _status.attached; },
  get clickThrough() { return _status.clickThrough; },
  get gameRunning() { return _status.gameRunning; },
  get standalone() { return _status.standalone; },
  get transparent() { return _status.transparent; },
  get hidden() { return _hidden; },
};

// ── Commands ──────────────────────────────────────────────────────────────────

export async function refreshStatus(): Promise<OverlayStatus> {
  _status = await invoke<OverlayStatus>('get_overlay_status');
  return _status;
}

export async function findGameWindow(): Promise<WindowInfo | null> {
  return invoke<WindowInfo | null>('find_game_window');
}

/** Switch which game the overlay targets ("poe1" | "poe2"). Takes effect on the
 *  next attach/status check. */
export async function setActiveGame(game: 'poe1' | 'poe2'): Promise<void> {
  await invoke('set_active_game', { game });
}

export async function attachToGame(): Promise<WindowInfo> {
  const info = await invoke<WindowInfo>('attach_to_game');
  await refreshStatus();
  return info;
}

export async function detachFromGame(): Promise<void> {
  await invoke('detach_from_game');
  await refreshStatus();
}

export async function setClickThrough(enabled: boolean): Promise<void> {
  const win = getCurrentWindow();
  // Call both the Tauri window API and our Rust command so state stays in sync.
  await invoke('set_click_through', { enabled });
  // Also handle it directly via the Tauri API for the cursor events.
  await win.setIgnoreCursorEvents(enabled);
  _status = { ..._status, clickThrough: enabled };
}

export async function toggleClickThrough(): Promise<void> {
  await setClickThrough(!_status.clickThrough);
}

// ── Full visibility (hide/show the whole overlay window) ───────────────────────
// Unlike click-through (which only dims the window), this removes the window
// entirely so nothing renders and no clicks are captured.

export async function setHidden(hidden: boolean): Promise<void> {
  const win = getCurrentWindow();
  if (hidden) {
    await win.hide();
  } else {
    await win.show();
  }
  _hidden = hidden;
}

export async function toggleHidden(): Promise<void> {
  await setHidden(!_hidden);
}
