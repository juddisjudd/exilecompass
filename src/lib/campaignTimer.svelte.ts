// Automatic campaign timer for speedrunners.
//
// The player manually starts/stops the overall run; act and interlude splits are
// recorded automatically by watching the game's [SCENE] Set Source log lines:
//   - Acts: the game emits a clean "[Act N]" scene when entering each act.
//   - Interludes: there is no act marker, so we detect them by zone membership.
// Progression is forward-only (re-entering an earlier act's town won't rewind a
// split). State lives in this shared module so it keeps tracking across UI tab
// switches (the Timer component unmounts when you leave its tab) and is
// persisted to disk so an in-progress run survives an app restart.

import { persistGet, persistSet, persistRemove } from '$lib/persist';

const STORAGE_KEY = 'EXILECOMPASS_CAMPAIGN_TIMER_V1';

export interface CampaignSegment {
  key: string;
  label: string;
  start: number | null; // epoch ms
  end: number | null;   // epoch ms
}

const SEGMENT_DEFS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'act1', label: 'Act 1' },
  { key: 'act2', label: 'Act 2' },
  { key: 'act3', label: 'Act 3' },
  { key: 'act4', label: 'Act 4' },
  { key: 'int1', label: 'Curse of Holten' },
  { key: 'int2', label: 'The Stolen Barya' },
  { key: 'int3', label: "Doryani's Contingency" },
];

// Interlude zones (from the [SCENE] log) → segment index. Acts use the "[Act N]"
// marker instead, so they aren't listed here.
const INTERLUDE_ZONES: Record<number, ReadonlySet<string>> = {
  4: new Set([
    'The Refuge', 'Scorched Farmlands', 'Stones of Serle', 'The Blackwood',
    'Holten', 'Wolvenhold', 'Holten Estate',
  ]),
  5: new Set([
    'The Khari Bazaar', 'The Khari Crossing', 'Pools of Khatal', 'The Galai Gates',
    'Sel Khari Sanctuary', 'Qimah', 'Qimah Reservoir',
  ]),
  6: new Set([
    'The Glade', 'Ashen Forest', 'Kriar Village', 'Glacial Tarn', 'Kriar Peaks',
    'Howling Caves', 'Lightless Passage', 'Etched Ravine', 'The Cuachic Vault',
  ]),
};

/** Map a [SCENE] source name to a campaign segment index, or null if it isn't a
 *  segment trigger (towns, hideouts, loading screens, specific act zones, etc.). */
function sceneToIndex(scene: string): number | null {
  const s = scene.trim();
  const act = /^Act ([1-4])$/.exec(s);
  if (act) return parseInt(act[1], 10) - 1; // 0–3
  for (const idx of [4, 5, 6]) {
    if (INTERLUDE_ZONES[idx].has(s)) return idx;
  }
  return null;
}

function freshSegments(): CampaignSegment[] {
  return SEGMENT_DEFS.map((d) => ({ key: d.key, label: d.label, start: null, end: null }));
}

interface PersistShape {
  running: boolean;
  startMs: number | null;
  stopMs: number | null;
  currentIndex: number;
  segments: CampaignSegment[];
}

class CampaignTimer {
  running = $state(false);
  startMs = $state<number | null>(null);
  stopMs = $state<number | null>(null);
  currentIndex = $state(-1);
  segments = $state<CampaignSegment[]>(freshSegments());
  #loaded = false;

  /** Restore a persisted run from disk. Call once on app start. */
  async load() {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const raw = await persistGet(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as PersistShape;
      if (!Array.isArray(d.segments) || d.segments.length !== SEGMENT_DEFS.length) return;
      this.running = !!d.running;
      this.startMs = d.startMs ?? null;
      this.stopMs = d.stopMs ?? null;
      this.currentIndex = typeof d.currentIndex === 'number' ? d.currentIndex : -1;
      // Re-apply labels from the current defs; keep saved start/end times.
      this.segments = SEGMENT_DEFS.map((def, i) => ({
        key: def.key,
        label: def.label,
        start: d.segments[i]?.start ?? null,
        end: d.segments[i]?.end ?? null,
      }));
    } catch { /* ignore corrupt state */ }
  }

  #save() {
    const data: PersistShape = {
      running: this.running,
      startMs: this.startMs,
      stopMs: this.stopMs,
      currentIndex: this.currentIndex,
      segments: this.segments.map((s) => ({ ...s })),
    };
    void persistSet(STORAGE_KEY, JSON.stringify(data));
  }

  /** Begin a run. Act 1 opens immediately (you start at the campaign beginning). */
  start() {
    const now = Date.now();
    this.segments = freshSegments();
    this.running = true;
    this.startMs = now;
    this.stopMs = null;
    this.currentIndex = 0;
    this.segments[0].start = now;
    this.#save();
  }

  /** End the run; close the active segment. */
  stop() {
    if (!this.running) return;
    const now = Date.now();
    this.stopMs = now;
    if (this.currentIndex >= 0 && this.segments[this.currentIndex].end === null) {
      this.segments[this.currentIndex].end = now;
    }
    this.running = false;
    this.#save();
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
  }

  reset() {
    this.running = false;
    this.startMs = null;
    this.stopMs = null;
    this.currentIndex = -1;
    this.segments = freshSegments();
    void persistRemove(STORAGE_KEY);
  }

  /** Feed a [SCENE] transition (with its log timestamp). Advances the split when
   *  the player reaches a later act/interlude. */
  handleScene(scene: string, timeMs: number) {
    if (!this.running) return;
    const idx = sceneToIndex(scene);
    if (idx === null) return;
    if (idx <= this.currentIndex) return;            // forward-only
    if (this.startMs !== null && timeMs < this.startMs) return; // ignore pre-start lines

    // Close the segment we're leaving, open the one we just entered.
    if (this.currentIndex >= 0 && this.segments[this.currentIndex].end === null) {
      this.segments[this.currentIndex].end = timeMs;
    }
    this.segments[idx].start = timeMs;
    this.currentIndex = idx;
    this.#save();
  }
}

export const campaignTimer = new CampaignTimer();
