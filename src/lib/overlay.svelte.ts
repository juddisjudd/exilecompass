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
}

// ── Reactive state (Svelte 5 runes) ───────────────────────────────────────────

let _status = $state<OverlayStatus>({
  attached: false,
  clickThrough: false,
  gameRunning: false,
});

export const overlayState = {
  get attached() { return _status.attached; },
  get clickThrough() { return _status.clickThrough; },
  get gameRunning() { return _status.gameRunning; },
};

// ── Commands ──────────────────────────────────────────────────────────────────

export async function refreshStatus(): Promise<OverlayStatus> {
  _status = await invoke<OverlayStatus>('get_overlay_status');
  return _status;
}

export async function findGameWindow(): Promise<WindowInfo | null> {
  return invoke<WindowInfo | null>('find_game_window');
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
