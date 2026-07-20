// Which game the overlay currently targets. Disk-backed (not plain
// localStorage) since it decides which native window/log-file detection runs
// on startup — the same reliability tier as the log file path / build folder
// settings in persist.ts.

import { persistGet, persistSet } from '$lib/persist';
import { setActiveGame } from '$lib/overlay.svelte';

export type GameMode = 'poe2' | 'poe1';

const KEY = 'EXILECOMPASS_GAME_MODE_V1';

let _mode = $state<GameMode>('poe2');
let _loaded = false;

export const gameMode = {
	get current(): GameMode {
		return _mode;
	}
};

/** Restore the saved mode (if any) and sync it to the Rust side. Call once on startup. */
export async function loadGameMode(): Promise<void> {
	if (_loaded) return;
	_loaded = true;
	const raw = await persistGet(KEY);
	if (raw === 'poe1' || raw === 'poe2') {
		_mode = raw;
		await setActiveGame(_mode);
	}
}

export async function setGameMode(mode: GameMode): Promise<void> {
	if (_mode === mode) return;
	_mode = mode;
	await persistSet(KEY, mode);
	await setActiveGame(mode);
}
