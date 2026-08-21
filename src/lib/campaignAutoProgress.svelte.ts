// "You are here" position for the PoE2 Campaign Guide. Lives outside the
// component so it tracks across tab switches. Position only — never touches
// objective completion (campaignProgress.svelte.ts).

import { CAMPAIGN_DATA } from '$lib/campaign';
import SCENES from './data/campaign/scenes.json';
import { buildEdges, matchDialogue, matchScene, type CampaignEdge } from './campaignEdges';

const POS_KEY = 'EXILECOMPASS_CAMPAIGN_AUTO_PROGRESS_POS_V2';
const LEGACY_EDGE_KEY = 'EXILECOMPASS_CAMPAIGN_AUTO_PROGRESS_EDGE_V1';
const ENABLED_KEY = 'EXILECOMPASS_CAMPAIGN_AUTO_PROGRESS_ENABLED_V1';

const EDGES: CampaignEdge[] = buildEdges();

let _activeEdgeIndex = $state(0);
let _enabled = $state(true);
let _loaded = false;

function resolvePosition(zoneId: string | null, objectiveId: string | null): number {
  if (objectiveId) {
    const i = EDGES.findIndex((e) => e.kind === 'dialogue' && e.objectiveId === objectiveId);
    if (i >= 0) return i;
  }
  if (zoneId) {
    const i = EDGES.findIndex((e) => e.zoneId === zoneId);
    if (i >= 0) return i;
  }
  return 0;
}

// V1 was an index into the zone-only edge list (zones with a scenes.json entry).
function migrateLegacyIndex(): number | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_EDGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(LEGACY_EDGE_KEY);
    const idx = Number(JSON.parse(raw).activeEdgeIndex ?? 0);
    const sceneMap: Record<string, string> = SCENES;
    const zones = CAMPAIGN_DATA.flatMap((a) => a.zones.filter((z) => sceneMap[z.id]).map((z) => z.id));
    return resolvePosition(zones[idx] ?? null, null);
  } catch {
    return null;
  }
}

/** Idempotent — safe to call on every game-mode switch. */
export function load() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      _activeEdgeIndex = resolvePosition(p.zoneId ?? null, p.objectiveId ?? null);
    } else {
      _activeEdgeIndex = migrateLegacyIndex() ?? 0;
    }
  } catch {
    _activeEdgeIndex = 0;
  }
  const savedEnabled = window.localStorage.getItem(ENABLED_KEY);
  if (savedEnabled !== null) _enabled = savedEnabled === 'true';
}

function setIndex(i: number) {
  _activeEdgeIndex = i;
  const e = EDGES[i];
  try {
    window.localStorage.setItem(
      POS_KEY,
      JSON.stringify({ zoneId: e?.zoneId ?? null, objectiveId: e?.kind === 'dialogue' ? e.objectiveId : null }),
    );
  } catch {
    /* ignore */
  }
}

export function handleScene(scene: string) {
  if (!_enabled) return;
  const i = matchScene(EDGES, _activeEdgeIndex, scene);
  if (i !== null && i !== _activeEdgeIndex) setIndex(i);
}

export function handleDialogue(speaker: string, text: string) {
  if (!_enabled) return;
  const i = matchDialogue(EDGES, _activeEdgeIndex, speaker, text);
  if (i !== null && i !== _activeEdgeIndex) setIndex(i);
}

export function jumpToEdge(index: number) {
  if (index < 0 || index >= EDGES.length) return;
  setIndex(index);
}

export function reset() {
  setIndex(0);
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
  get activeZoneId(): string | null {
    return EDGES[_activeEdgeIndex]?.zoneId ?? null;
  },
  /** Null when only the zone is known. */
  get activeObjectiveId(): string | null {
    const e = EDGES[_activeEdgeIndex];
    return e?.kind === 'dialogue' ? e.objectiveId : null;
  },
  edgeIndexForZone(zoneId: string): number | null {
    const idx = EDGES.findIndex((e) => e.zoneId === zoneId);
    return idx >= 0 ? idx : null;
  },
  edgeIndexForObjective(objectiveId: string): number | null {
    const idx = EDGES.findIndex((e) => e.kind === 'dialogue' && e.objectiveId === objectiveId);
    return idx >= 0 ? idx : null;
  },
};
