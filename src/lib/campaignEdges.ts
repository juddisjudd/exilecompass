// Rune-free edge model + matching rules for campaignAutoProgress.svelte.ts,
// so a whole Client.txt can be replayed through it with bun.

import { CAMPAIGN_DATA } from './campaign';
import SCENES from './data/campaign/scenes.json';
import DIALOGUE from './data/campaign/dialogue.json';

export type CampaignEdge = {
  /** Index into CAMPAIGN_DATA — acts and interludes alike. */
  act: number;
  zoneId: string;
} & (
  | { kind: 'scene'; scene: string }
  | { kind: 'dialogue'; speaker: string; text: string; objectiveId: string }
);

const SCENE_MAP: Record<string, string> = SCENES;
const DIALOGUE_MAP: Record<string, string[]> = DIALOGUE;

/** Hubs only match as the guide's very next zone, and never backward. */
export const HUB_SCENES = new Set([
  'Clearfell Encampment',
  'The Ardura Caravan',
  'Ziggurat Encampment',
  'Kingsmarch',
  'The Refuge',
  'Holten',
  'The Khari Bazaar',
  'The Glade',
]);

/** Forward reach past the current act, in scene edges (in-act is unbounded). */
export const LOOKAHEAD = 10;

export function normalizeDialogue(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function parseAnchor(line: string): { speaker: string; text: string } | null {
  const i = line.indexOf(': ');
  if (i <= 0) return null;
  return { speaker: normalizeDialogue(line.slice(0, i)), text: normalizeDialogue(line.slice(i + 2)) };
}

export function buildEdges(): CampaignEdge[] {
  const edges: CampaignEdge[] = [];
  CAMPAIGN_DATA.forEach((act, actIdx) => {
    for (const zone of act.zones) {
      const scene = SCENE_MAP[zone.id];
      if (scene) edges.push({ kind: 'scene', act: actIdx, zoneId: zone.id, scene: scene.trim() });
      for (const obj of zone.objectives) {
        for (const line of DIALOGUE_MAP[obj.id] ?? []) {
          const a = parseAnchor(line);
          if (a) edges.push({ kind: 'dialogue', act: actIdx, zoneId: zone.id, objectiveId: obj.id, ...a });
        }
      }
    }
  });
  return edges;
}

function nextSceneEdge(edges: CampaignEdge[], from: number): number | null {
  for (let i = from + 1; i < edges.length; i++) if (edges[i].kind === 'scene') return i;
  return null;
}

/** Edge a newly-logged [SCENE] name moves the marker to, or null to stay put. */
export function matchScene(edges: CampaignEdge[], current: number, rawScene: string): number | null {
  const scene = rawScene.trim();
  const first = edges[0];
  if (first?.kind === 'scene' && first.scene === scene) return current === 0 ? null : 0;
  const here = edges[current];
  if (!here) return null;
  if (HUB_SCENES.has(scene)) {
    const next = nextSceneEdge(edges, current);
    if (next === null) return null;
    const e = edges[next];
    return e.kind === 'scene' && e.scene === scene ? next : null;
  }
  if (here.kind === 'scene' && here.scene === scene) return null;

  let best: number | null = null;
  let bestDist = Infinity;
  let dist = 0;
  for (let i = current + 1; i < edges.length; i++) {
    const e = edges[i];
    if (e.kind !== 'scene') continue;
    dist++;
    if (e.act !== here.act && dist > LOOKAHEAD) break;
    if (e.scene === scene) {
      best = i;
      bestDist = dist;
      break;
    }
  }
  dist = 0;
  for (let i = current - 1; i >= 0; i--) {
    const e = edges[i];
    if (e.act !== here.act) break;
    if (e.kind !== 'scene') continue;
    dist++;
    if (dist >= bestDist) break;
    if (e.scene === scene) return e.zoneId === here.zoneId ? null : i;
  }
  return best;
}

/** Forward-only: barks replay on every approach, so a line behind the marker
 *  is never evidence of going back. */
export function matchDialogue(
  edges: CampaignEdge[],
  current: number,
  speaker: string,
  text: string,
): number | null {
  const here = edges[current];
  if (!here) return null;
  const sp = normalizeDialogue(speaker);
  const tx = normalizeDialogue(text);
  if (!sp || !tx) return null;
  let dist = 0;
  for (let i = current + 1; i < edges.length; i++) {
    const e = edges[i];
    if (e.kind === 'scene') {
      dist++;
      if (e.act !== here.act && dist > LOOKAHEAD) break;
      continue;
    }
    if (e.speaker === sp && tx.startsWith(e.text)) return i;
  }
  return null;
}
