// Shared PoE1 leveling-step completion state (fragment steps, keyed by step id).
//
// Mirrors campaignProgress.svelte.ts's shape: lives outside the guide
// component so it survives switching tabs, persisted to localStorage.
// The ordered complete-next/undo-last walk lives in levelingRoute.svelte.ts
// (levelingCompleteNext/levelingUndoLast) since the route is built at runtime
// and includes gem steps with their own progress store.

import { SvelteSet } from 'svelte/reactivity';

const KEY = 'EXILECOMPASS_POE1_LEVELING_PROGRESS_V1';

class Poe1LevelingProgress {
	completed = $state(new SvelteSet<string>());
	#loaded = false;

	load() {
		if (this.#loaded) return;
		this.#loaded = true;
		try {
			const raw = window.localStorage.getItem(KEY);
			if (raw) this.completed = new SvelteSet<string>(JSON.parse(raw));
		} catch {
			/* ignore corrupt state */
		}
	}

	#save() {
		window.localStorage.setItem(KEY, JSON.stringify([...this.completed]));
	}

	has(id: string): boolean {
		return this.completed.has(id);
	}

	toggle(id: string) {
		if (this.completed.has(id)) this.completed.delete(id);
		else this.completed.add(id);
		this.#save();
	}

	resetAll() {
		this.completed = new SvelteSet<string>();
		this.#save();
	}

	/** Mark every given step id complete or clear them all — used to check off
	 *  (or un-check) a whole section at once. */
	setMany(ids: string[], done: boolean) {
		for (const id of ids) {
			if (done) this.completed.add(id);
			else this.completed.delete(id);
		}
		this.#save();
	}
}

export const poe1LevelingProgress = new Poe1LevelingProgress();
