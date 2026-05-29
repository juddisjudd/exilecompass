import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error';
  version?: string;
  notes?: string;
  progress?: number; // 0–100
  error?: string;
}

/** Check GitHub releases for a newer signed build. Returns the Update handle
 *  (or null if up to date). Errors are thrown for the caller to surface. */
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** Download + install an update, reporting progress, then relaunch. */
export async function installUpdate(
  update: Update,
  onProgress?: (pct: number) => void,
): Promise<void> {
  let downloaded = 0;
  let total = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (total > 0) onProgress?.(Math.round((downloaded / total) * 100));
        break;
      case 'Finished':
        onProgress?.(100);
        break;
    }
  });

  await relaunch();
}
