// Shared PoE1 leveling-step completion state (fragment steps, keyed by step id).
//
// Mirrors campaignProgress.svelte.ts's shape: lives outside the guide
// component so it survives switching tabs, persisted to localStorage.
// The ordered complete-next/undo-last walk lives in levelingRoute.svelte.ts
// (levelingCompleteNext/levelingUndoLast) since the route is built at runtime
// and includes gem steps with their own progress store.
//
// Scoped per active PoB build (see poe1Pob.ts's build store): each stored
// build tracks its own independent progress, so leveling multiple
// characters/leagues in parallel doesn't mix their checkmarks. `switchScope`
// points this store at a given build's slice (or the unsuffixed default
// bucket when no build is active — the same key this store always used
// before multi-build support existed, so users who've never imported a build
// keep working exactly as before).

import { SvelteSet } from 'svelte/reactivity';

// Exported so poe1Pob.ts's legacy-build migration can copy this exact base
// key's value into a newly-migrated build's scoped slot without duplicating
// the literal string.
export const LEVELING_PROGRESS_KEY = 'EXILECOMPASS_POE1_LEVELING_PROGRESS_V1';
const KEY = LEVELING_PROGRESS_KEY;

function keyFor(buildId: string | null): string {
	return buildId ? `${KEY}_${buildId}` : KEY;
}

class Poe1LevelingProgress {
	completed = $state(new SvelteSet<string>());
	#currentKey: string = KEY;

	/** Point this store at a build's progress (or the default bucket when
	 *  `buildId` is null) and load whatever's saved there. Safe to call
	 *  repeatedly — on startup, and again any time the active build changes. */
	switchScope(buildId: string | null) {
		this.#currentKey = keyFor(buildId);
		try {
			const raw = window.localStorage.getItem(this.#currentKey);
			this.completed = raw ? new SvelteSet<string>(JSON.parse(raw)) : new SvelteSet<string>();
		} catch {
			this.completed = new SvelteSet<string>();
		}
	}

	#save() {
		window.localStorage.setItem(this.#currentKey, JSON.stringify([...this.completed]));
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

/** Delete a specific build's stored progress — called when that build is
 *  removed from the store (poe1Pob.ts). Leaves the default/no-build bucket
 *  alone; only ever targets a real build id. */
export function deletePoe1LevelingProgressFor(buildId: string) {
	try {
		window.localStorage.removeItem(keyFor(buildId));
	} catch {
		/* ignore */
	}
}
