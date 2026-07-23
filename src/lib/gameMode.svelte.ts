// Which game the overlay currently targets. Disk-backed (not plain
// localStorage) since it decides which native window/log-file detection runs
// on startup — the same reliability tier as the log file path / build folder
// settings in persist.ts.

import { persistGet, persistSet } from '$lib/persist';
import { setActiveGame } from '$lib/overlay.svelte';

export type GameMode = 'poe2' | 'poe1';

const KEY = 'EXILECOMPASS_GAME_MODE_V1';

let _mode = $state<GameMode>('poe2');
let _loadPromise: Promise<void> | null = null;

export const gameMode = {
	get current(): GameMode {
		return _mode;
	}
};

/** Restore the saved mode (if any) and sync it to the Rust side. Call once on
 *  startup — safe to call from multiple places: concurrent callers all await
 *  the same in-flight load rather than racing (a caller that only checked a
 *  "started" flag before the read actually resolved could otherwise see
 *  `gameMode.current` still at its stale default). */
export function loadGameMode(): Promise<void> {
	_loadPromise ??= (async () => {
		const raw = await persistGet(KEY);
		if (raw === 'poe1' || raw === 'poe2') {
			_mode = raw;
			await setActiveGame(_mode);
		}
	})();
	return _loadPromise;
}

export async function setGameMode(mode: GameMode): Promise<void> {
	if (_mode === mode) return;
	_mode = mode;
	await persistSet(KEY, mode);
	await setActiveGame(mode);
}
