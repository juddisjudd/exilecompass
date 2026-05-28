import { invoke } from '@tauri-apps/api/core';

// Disk-backed key/value persistence via the Rust backend.
// Use for config values that must survive app restarts reliably — WebView2
// localStorage is not dependable across dev restarts. Stored in settings.json
// under the OS app-config directory.

export async function persistGet(key: string): Promise<string | null> {
  try {
    return (await invoke<string | null>('store_get', { key })) ?? null;
  } catch {
    return null;
  }
}

export async function persistSet(key: string, value: string): Promise<void> {
  try {
    await invoke('store_set', { key, value });
  } catch { /* ignore — best effort */ }
}

export async function persistRemove(key: string): Promise<void> {
  try {
    await invoke('store_remove', { key });
  } catch { /* ignore — best effort */ }
}
