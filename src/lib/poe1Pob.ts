// PoE1 Path of Building import.
//
// Ported from HeartofPhos/exile-leveling `web/src/components/BuildImportForm/pob.ts`.
// Reuses the app's existing PoB plumbing (src/lib/pob.ts): base64url+zlib
// decode via DecompressionStream, pobb.in resolution via the Rust
// `fetch_pobb_code` command (no CORS proxy needed, unlike upstream).
// The heavy gem/quest data loads lazily through the leveling vendor module.

import { resolveCode, zlibInflate } from '$lib/pob';
import { setLevelingBuild, type Bandit, type LevelingBuild } from '$lib/levelingRoute.svelte';

export interface Poe1BuildTree {
  name: string;
  /** PoB treeVersion, e.g. "3_26" — must match a shipped tree data file. */
  version: string;
  /** Official pathofexile.com passive-tree URL (node blob in the last path segment). */
  url: string;
}

/** A gem in a link group, display-resolved at import time so the Gems tab
 *  never needs the heavy game data at render. */
export interface Poe1GemLinkGem {
  id: string;
  name: string;
  colour: string;
  /** Where the gem can be bought for this class: "Quest — NPC (Act N)". */
  sources: string[];
}

/** One skill setup from the build (upstream's GemLinkGroup). */
export interface Poe1GemLinkGroup {
  title: string;
  primary: Poe1GemLinkGem[];
  secondary: Poe1GemLinkGem[];
}

export interface Poe1Build extends LevelingBuild {
  buildTrees: Poe1BuildTree[];
  gemLinks: Poe1GemLinkGroup[];
  importedAt: number;
}

const KEY = 'EXILECOMPASS_POE1_POB_V1';

// PoB exports a handful of gem ids that don't match the wiki-derived data —
// verbatim from upstream (sourced from PoB's skills.lua).
const GEM_ID_REMAP: Record<string, string> = {
  'Metadata/Items/Gems/Smite': 'Metadata/Items/Gems/SkillGemSmite',
  'Metadata/Items/Gems/ConsecratedPath': 'Metadata/Items/Gems/SkillGemConsecratedPath',
  'Metadata/Items/Gems/VaalAncestralWarchief': 'Metadata/Items/Gems/SkillGemVaalAncestralWarchief',
  'Metadata/Items/Gems/HeraldOfAgony': 'Metadata/Items/Gems/SkillGemHeraldOfAgony',
  'Metadata/Items/Gems/HeraldOfPurity': 'Metadata/Items/Gems/SkillGemHeraldOfPurity',
  'Metadata/Items/Gems/ScourgeArrow': 'Metadata/Items/Gems/SkillGemScourgeArrow',
  'Metadata/Items/Gems/RainOfSpores': 'Metadata/Items/Gems/SkillGemToxicRain',
  'Metadata/Items/Gems/SummonRelic': 'Metadata/Items/Gems/SkillGemSummonRelic',
  'Metadata/Items/Gems/SkillGemNewPhaseRun': 'Metadata/Items/Gems/SkillGemPhaseRun',
  'Metadata/Items/Gems/SkillGemNewArcticArmour': 'Metadata/Items/Gems/SkillGemArcticArmour',
};

const POB_COLOUR_REGEX = /\^(x[a-zA-Z0-9]{6}|[0-9])/g;
const cleanPobText = (dirty: string) => dirty.replace(POB_COLOUR_REGEX, '');

const BANDITS: Bandit[] = ['None', 'Oak', 'Kraityn', 'Alira'];

/** Parse a PoE1 PoB export: raw code, pobb.in link, or raw XML. */
export async function importPoe1Build(raw: string): Promise<Poe1Build> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty input');

  let xmlText: string;
  if (trimmed.startsWith('<')) {
    xmlText = trimmed;
  } else {
    const code = await resolveCode(trimmed);
    xmlText = await zlibInflate(code.trim());
  }

  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse PoB XML');

  const buildEl = doc.getElementsByTagName('Build')[0];
  if (!buildEl) throw new Error('Not a Path of Building export (no <Build> element)');

  const characterClass = buildEl.getAttribute('className') ?? 'None';
  const banditRaw = buildEl.getAttribute('bandit') || 'None';
  const bandit: Bandit = (BANDITS as string[]).includes(banditRaw) ? (banditRaw as Bandit) : 'None';

  // Gem normalization needs the vendored lookups — lazy-loaded.
  const { Data } = await import('./leveling/vendor/index.js');

  const mapGemId = (gemId: string): string => {
    const remapped = GEM_ID_REMAP[gemId];
    if (remapped) gemId = remapped;
    const vaal = Data.VaalGemLookup[gemId];
    if (vaal) gemId = vaal;
    const awakened = Data.AwakenedGemLookup[gemId];
    if (awakened) gemId = awakened;
    return gemId;
  };

  const requiredGems: Poe1Build['requiredGems'] = [];
  const gemLinks: Poe1GemLinkGroup[] = [];

  // Where a gem can be bought for this class — "Quest — NPC (Act N)". Faithful
  // to upstream's gemIdToGemLink: vendor reward offers only.
  const gemSources = (gemId: string): string[] => {
    const sources: string[] = [];
    for (const quest of Object.values(Data.Quests)) {
      for (const rewardOffer of Object.values(quest.reward_offers)) {
        if (!rewardOffer) continue;
        const vendor = rewardOffer.vendor[gemId];
        if (!vendor) continue;
        const existsForClass =
          vendor.classes.length === 0 || vendor.classes.includes(characterClass);
        if (existsForClass) {
          sources.push(`${quest.name} — ${vendor.npc} (Act ${quest.act})`);
        }
      }
    }
    return sources;
  };

  const toLinkGem = (gemId: string): Poe1GemLinkGem => {
    const gem = Data.Gems[gemId];
    return {
      id: gemId,
      name: gem.name,
      colour: Data.GemColours[gem.primary_attribute] ?? '#ffffff',
      sources: gemSources(gemId),
    };
  };

  const processSkills = (parent: Element, parentTitle: string | undefined) => {
    let recentEmptySkillLabel: string | undefined;
    for (const skillEl of Array.from(parent.getElementsByTagName('Skill'))) {
      const enabled = skillEl.getAttribute('enabled');
      if (!enabled || enabled === 'false') continue;

      const skillLabel = skillEl.getAttribute('label') ?? undefined;
      const gemEls = Array.from(skillEl.getElementsByTagName('Gem'));
      if (gemEls.length === 0) recentEmptySkillLabel = skillLabel;

      const primaryIds: string[] = [];
      const secondaryIds: string[] = [];
      for (const gemEl of gemEls) {
        const rawId = gemEl.getAttribute('gemId');
        if (!rawId) continue;
        const gemId = mapGemId(rawId);
        if (!Data.Gems[gemId]) continue; // unknown to the leveling data — skip
        if (!requiredGems.some((g) => g.id === gemId)) {
          requiredGems.push({
            id: gemId,
            note: cleanPobText(recentEmptySkillLabel || parentTitle || skillLabel || ''),
            count: 1,
          });
        }
        if (Data.Gems[gemId].is_support) secondaryIds.push(gemId);
        else primaryIds.push(gemId);
      }

      // Upstream quirk preserved: a support-only group promotes its supports.
      const title = cleanPobText(parentTitle || recentEmptySkillLabel || 'Default');
      if (primaryIds.length > 0) {
        gemLinks.push({
          title,
          primary: primaryIds.map(toLinkGem),
          secondary: secondaryIds.map(toLinkGem),
        });
      } else if (secondaryIds.length > 0) {
        gemLinks.push({ title, primary: secondaryIds.map(toLinkGem), secondary: [] });
      }
    }
  };

  const skillSets = Array.from(doc.getElementsByTagName('SkillSet'));
  if (skillSets.length > 0) {
    for (const setEl of skillSets) {
      processSkills(setEl, setEl.getAttribute('title') ?? undefined);
    }
  } else {
    processSkills(doc.documentElement, undefined);
  }

  const buildTrees: Poe1BuildTree[] = [];
  for (const specEl of Array.from(doc.getElementsByTagName('Spec'))) {
    const url = specEl.getElementsByTagName('URL')[0]?.textContent?.trim();
    const version = specEl.getAttribute('treeVersion');
    if (!url || !version) continue;
    buildTrees.push({
      name: cleanPobText(specEl.getAttribute('title') || 'Default'),
      version,
      url,
    });
  }

  const build: Poe1Build = {
    characterClass,
    bandit,
    requiredGems,
    buildTrees,
    gemLinks,
    importedAt: Date.now(),
  };

  savePoe1Build(build);
  await setLevelingBuild(build);
  return build;
}

// ── Persistence ─────────────────────────────────────────────────────────────

export function savePoe1Build(build: Poe1Build) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(build));
  } catch {
    /* storage full / blocked */
  }
}

export function loadPoe1Build(): Poe1Build | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Poe1Build;
  } catch {
    return null;
  }
}

/** Restore the stored build into the route store on startup (PoE1 flows). */
export async function restorePoe1Build(): Promise<void> {
  const build = loadPoe1Build();
  if (build) await setLevelingBuild(build);
}

export async function clearPoe1Build(): Promise<void> {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  await setLevelingBuild(null);
}
