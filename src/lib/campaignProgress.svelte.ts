// Shared campaign objective-completion state.
//
// Lives outside the CampaignGuide component so global hotkeys can mark objectives
// off while the game (not the overlay) is focused, and so the state survives the
// component unmounting when you switch tabs. Persisted to localStorage.

import { SvelteSet } from 'svelte/reactivity';
import { CAMPAIGN_DATA } from '$lib/campaign';

const KEY = 'EXILECOMPASS_CAMPAIGN_PROGRESS_V1';
const LEGACY_KEY = 'CAMPAIGN_GUIDE_STATE_V1'; // older combined state (expanded + completed)

// Same key CampaignGuide.svelte persists its "Show league mechanics" toggle
// under. Read directly here (rather than passed in) because completeNext/
// undoLast fire from global hotkeys/voice commands that can run while
// CampaignGuide isn't even mounted (e.g. on a different tab).
const SHOW_LEAGUE_KEY = 'EXILECOMPASS_CAMPAIGN_SHOW_LEAGUE_V1';
function showLeagueMechanics(): boolean {
  const saved = window.localStorage.getItem(SHOW_LEAGUE_KEY);
  return saved === null ? true : saved === 'true'; // defaults to shown, matching CampaignGuide.svelte
}

// Flat, ordered list of every objective with its optional/league flags —
// drives the "complete next" / "undo last" hotkeys along the required
// (critical) path. Every league-mechanic objective in the data is also
// flagged optional (it's inherently side content), so it's ordinarily
// skipped like any other optional objective — except while "Show league
// mechanics" is on, where it's promoted into the walked path since it's
// visibly part of this league's campaign guide.
interface OrderedObjective { id: string; optional: boolean; league: boolean; }
const ORDERED: OrderedObjective[] = (() => {
  const out: OrderedObjective[] = [];
  for (const act of CAMPAIGN_DATA) {
    for (const zone of act.zones) {
      for (const obj of zone.objectives) {
        const o = obj as { optional?: boolean; league?: boolean };
        out.push({ id: obj.id, optional: !!o.optional, league: !!o.league });
      }
    }
  }
  return out;
})();

function isSkipped(o: OrderedObjective): boolean {
  return o.optional && (!o.league || !showLeagueMechanics());
}

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

  /** Mark every given objective id complete or clear them all — used to check
   *  off (or un-check) a whole act at once. */
  setMany(ids: string[], done: boolean) {
    for (const id of ids) {
      if (done) this.completed.add(id);
      else this.completed.delete(id);
    }
    this.#save();
  }

  /** Id of the objective `completeNext()` would mark next, without marking it. */
  peekNext(): string | null {
    for (const o of ORDERED) {
      if (isSkipped(o)) continue;
      if (!this.completed.has(o.id)) return o.id;
    }
    return null;
  }

  /** Mark the next incomplete required objective done. Returns its id, or null
   *  if the required path is already complete. Non-league optional objectives
   *  are always skipped (mark those by clicking); league objectives are only
   *  skipped while "Show league mechanics" is off. */
  completeNext(): string | null {
    for (const o of ORDERED) {
      if (isSkipped(o)) continue;
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
      if (isSkipped(o)) continue;
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
