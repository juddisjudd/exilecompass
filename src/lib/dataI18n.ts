// Locale-aware overlay for game data (campaign zones/objectives, rewards).
//
// The base data (src/lib/data/*.json) stays in English. Per-locale overlay
// files (src/lib/data/i18n/<locale>.json) map stable IDs → translated strings.
// Anything missing falls back to the English base, so translations can be
// filled in incrementally — including by contributors editing the JSON, the
// same workflow described in src/lib/data/campaign/README.md.
//
// Overlay shape (all sections optional):
// {
//   "acts":        { "<actNumber>": "Act name" },
//   "zones":       { "<zoneId>": "Zone name" },
//   "objectives":  { "<objId>": "Objective text" },
//   "objectiveRewards": { "<objId>": "Reward badge text" },
//   "notes":       { "<objId>": ["Note line 1", "Note line 2"] },
//   "rewards":     { "<rewardId>": { "source": "...", "location": "...", "label": "..." } },
//   "rewardGroups":{ "<groupId>": "Group label" }
// }

import { getLocale } from '$lib/paraglide/runtime.js';
import de from './data/i18n/de.json';
import es from './data/i18n/es.json';
import fr from './data/i18n/fr.json';
import ja from './data/i18n/ja.json';
import ko from './data/i18n/ko.json';
import ptbr from './data/i18n/pt-br.json';
import ru from './data/i18n/ru.json';
import zhcn from './data/i18n/zh-cn.json';

interface Overlay {
  acts?: Record<string, string>;
  zones?: Record<string, string>;
  objectives?: Record<string, string>;
  objectiveRewards?: Record<string, string>;
  notes?: Record<string, string[]>;
  rewards?: Record<string, { source?: string; location?: string; label?: string }>;
  rewardGroups?: Record<string, string>;
}

const OVERLAYS: Record<string, Overlay> = {
  de, es, fr, ja, ko, 'pt-br': ptbr, ru, 'zh-cn': zhcn,
};

function current(): Overlay | undefined {
  return OVERLAYS[getLocale()];
}

export function trAct(actNumber: number, en: string): string {
  return current()?.acts?.[String(actNumber)] ?? en;
}

export function trZone(zoneId: string, en: string): string {
  return current()?.zones?.[zoneId] ?? en;
}

export function trObjective(objId: string, en: string): string {
  return current()?.objectives?.[objId] ?? en;
}

export function trObjectiveReward(objId: string, en: string): string {
  return current()?.objectiveRewards?.[objId] ?? en;
}

export function trNotes(objId: string, en: string[]): string[] {
  return current()?.notes?.[objId] ?? en;
}

export function trReward(rewardId: string, field: 'source' | 'location' | 'label', en: string): string {
  return current()?.rewards?.[rewardId]?.[field] ?? en;
}

export function trRewardGroup(groupId: string, en: string): string {
  return current()?.rewardGroups?.[groupId] ?? en;
}
