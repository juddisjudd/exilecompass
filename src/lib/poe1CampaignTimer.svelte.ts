// Automatic campaign timer for PoE1 speedrunners — mirrors campaignTimer.svelte.ts's
// PoE2 implementation, but splits are detected from area ids rather than [SCENE]
// names: PoE1's internal area ids encode the act number directly (e.g. "1_3_town"
// is Act 3, "2_8_1" is Act 8 — acts 1–5 use a "1_" prefix and 6–10 a "2_" prefix,
// a leftover of the old two-playthrough system, but the second segment is always
// the act number), so this reuses the same "Generating level..." area-id extractor
// that auto-progress (levelingRoute.svelte.ts) already relies on, rather than
// building a separate PoE1 scene-name lookup table.
// The player manually starts/stops the overall run; act splits are recorded
// automatically. Progression is forward-only (re-entering an earlier act's town
// won't rewind a split). State lives in this shared module so it keeps tracking
// across UI tab switches and is persisted to disk so an in-progress run survives
// an app restart.

import { persistGet, persistSet, persistRemove } from '$lib/persist';

const STORAGE_KEY = 'EXILECOMPASS_POE1_CAMPAIGN_TIMER_V1';

export interface CampaignSegment {
  key: string;
  label: string;
  start: number | null; // epoch ms
  end: number | null;   // epoch ms
}

const SEGMENT_DEFS: ReadonlyArray<{ key: string; label: string }> = Array.from(
  { length: 10 },
  (_, i) => ({ key: `act${i + 1}`, label: `Act ${i + 1}` }),
);

const AREA_ID_ACT_RE = /^\d+_(\d+)_/;

/** Map a PoE1 area id to a campaign segment index (0–9), or null if it doesn't
 *  look like an act zone (e.g. hideout / endgame map ids). */
function areaIdToIndex(areaId: string): number | null {
  const m = AREA_ID_ACT_RE.exec(areaId);
  if (!m) return null;
  const act = parseInt(m[1], 10);
  if (act < 1 || act > 10) return null;
  return act - 1;
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

class Poe1CampaignTimer {
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

  /** Feed an area id transition (with its log timestamp). Advances the split
   *  when the player reaches a later act. */
  handleAreaId(areaId: string, timeMs: number) {
    if (!this.running) return;
    const idx = areaIdToIndex(areaId);
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

export const poe1CampaignTimer = new Poe1CampaignTimer();
