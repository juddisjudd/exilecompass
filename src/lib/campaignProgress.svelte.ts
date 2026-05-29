// Shared campaign objective-completion state.
//
// Lives outside the CampaignGuide component so global hotkeys can mark objectives
// off while the game (not the overlay) is focused, and so the state survives the
// component unmounting when you switch tabs. Persisted to localStorage.

import { SvelteSet } from 'svelte/reactivity';
import { CAMPAIGN_DATA } from '$lib/campaign';

const KEY = 'EXILECOMPASS_CAMPAIGN_PROGRESS_V1';
const LEGACY_KEY = 'CAMPAIGN_GUIDE_STATE_V1'; // older combined state (expanded + completed)

// Flat, ordered list of every objective with its optional flag — drives the
// "complete next" / "undo last" hotkeys along the required (critical) path.
interface OrderedObjective { id: string; optional: boolean; }
const ORDERED: OrderedObjective[] = (() => {
  const out: OrderedObjective[] = [];
  for (const act of CAMPAIGN_DATA) {
    for (const zone of act.zones) {
      for (const obj of zone.objectives) {
        out.push({ id: obj.id, optional: !!(obj as { optional?: boolean }).optional });
      }
    }
  }
  return out;
})();

class CampaignProgress {
  completed = $state(new SvelteSet<string>());
  #loaded = false;

  load() {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        this.completed = new SvelteSet<string>(JSON.parse(raw));
        return;
      }
      // Migrate completion out of the older combined CampaignGuide state.
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed?.completedObjectives)) {
          this.completed = new SvelteSet<string>(parsed.completedObjectives);
          this.#save();
        }
      }
    } catch { /* ignore corrupt state */ }
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

  /** Mark the next incomplete required objective done. Returns its id, or null
   *  if the required path is already complete. Optional objectives are skipped
   *  (mark those by clicking). */
  completeNext(): string | null {
    for (const o of ORDERED) {
      if (o.optional) continue;
      if (!this.completed.has(o.id)) {
        this.completed.add(o.id);
        this.#save();
        return o.id;
      }
    }
    return null;
  }

  /** Un-mark the last completed required objective (inverse of completeNext). */
  undoLast(): string | null {
    for (let i = ORDERED.length - 1; i >= 0; i--) {
      const o = ORDERED[i];
      if (o.optional) continue;
      if (this.completed.has(o.id)) {
        this.completed.delete(o.id);
        this.#save();
        return o.id;
      }
    }
    return null;
  }
}

export const campaignProgress = new CampaignProgress();
