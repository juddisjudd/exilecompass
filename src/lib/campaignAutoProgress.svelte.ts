// "You are here" position tracking for the PoE2 Campaign Guide, ported from
// levelingRoute.svelte.ts's PoE1 edge system (see that file's comments for the
// original design). Lives outside CampaignGuide.svelte so it keeps tracking
// across tab switches and applies even before that tab is ever opened — same
// reasoning as campaignProgress.svelte.ts / campaignTimer.svelte.ts.
//
// Position only: never touches objective completion (campaignProgress.svelte.ts).

import { CAMPAIGN_DATA } from '$lib/campaign';
import SCENES from './data/campaign/scenes.json';

const EDGE_KEY = 'EXILECOMPASS_CAMPAIGN_AUTO_PROGRESS_EDGE_V1';
const ENABLED_KEY = 'EXILECOMPASS_CAMPAIGN_AUTO_PROGRESS_ENABLED_V1';

const SCENE_MAP: Record<string, string> = SCENES;

// Flat, in-guide-order sequence of (scene name, zone id) pairs — one entry per
// zone that has a known [SCENE] string in scenes.json. Zones with no mapping
// (mostly optional league detours) are skipped entirely: they never get a
// marker, but don't break the sequence for the zones around them. Built once
// from CAMPAIGN_DATA, which already excludes disabled acts.
let _edges: string[] = [];
let _edgeZones: string[] = [];
(() => {
  for (const act of CAMPAIGN_DATA) {
    for (const zone of act.zones) {
      const scene = SCENE_MAP[zone.id];
      if (!scene) continue;
      _edges.push(scene);
      _edgeZones.push(zone.id);
    }
  }
})();

let _activeEdgeIndex = $state(0);
let _enabled = $state(true);
let _loaded = false;

/** Read persisted position + on/off state. Idempotent — safe to call on every
 *  game-mode switch alongside campaignTimer.load()/poe1CampaignTimer.load(). */
export function load() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = window.localStorage.getItem(EDGE_KEY);
    _activeEdgeIndex = raw ? (JSON.parse(raw).activeEdgeIndex ?? 0) : 0;
  } catch {
    _activeEdgeIndex = 0;
  }
  const savedEnabled = window.localStorage.getItem(ENABLED_KEY);
  if (savedEnabled !== null) _enabled = savedEnabled === 'true';
}

function saveEdgeIndex() {
  try {
    window.localStorage.setItem(EDGE_KEY, JSON.stringify({ activeEdgeIndex: _activeEdgeIndex }));
  } catch {
    /* ignore */
  }
}

// Zones are coarser than PoE1's fragment steps, and several zones share an
// identical scene name (e.g. "Clearfell Encampment" recurs 5 times across Act
// 1) — a lookahead window this small (vs PoE1's 20) keeps a stale/misdetected
// event from skipping several real zones ahead on a coincidental repeat.
const EDGE_LOOKAHEAD = 10;

/** Called with each newly-detected [SCENE] name from the log. Forward-only —
 *  searches a bounded window ahead of the current position for the next
 *  matching scene, same reasoning as advanceLevelingEdge in
 *  levelingRoute.svelte.ts. No-ops if auto-progress is off. */
export function handleScene(scene: string) {
  if (!_enabled) return;
  const end = Math.min(_activeEdgeIndex + 1 + EDGE_LOOKAHEAD, _edges.length);
  for (let i = _activeEdgeIndex + 1; i < end; i++) {
    if (_edges[i] === scene) {
      _activeEdgeIndex = i;
      saveEdgeIndex();
      return;
    }
  }
}

/** Manual override — click a zone's position marker to jump there directly. */
export function jumpToEdge(index: number) {
  if (index < 0 || index >= _edges.length) return;
  _activeEdgeIndex = index;
  saveEdgeIndex();
}

export function setEnabled(value: boolean) {
  _enabled = value;
  try {
    window.localStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    /* ignore */
  }
}

export const campaignAutoProgress = {
  get enabled() {
    return _enabled;
  },
  /** The zone id currently marked "you are here", or null if no zone has been
   *  matched yet (or the map has no edges at all). */
  get activeZoneId(): string | null {
    return _edgeZones[_activeEdgeIndex] ?? null;
  },
  /** Whether a given zone id has an edge (and can be clicked to jump to). */
  edgeIndexForZone(zoneId: string): number | null {
    const idx = _edgeZones.indexOf(zoneId);
    return idx >= 0 ? idx : null;
  },
};
