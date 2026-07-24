// PoE1 Path of Building import.
//
// Ported from HeartofPhos/exile-leveling `web/src/components/BuildImportForm/pob.ts`.
// Reuses the app's existing PoB plumbing (src/lib/pob.ts): base64url+zlib
// decode via DecompressionStream, pobb.in resolution via the Rust
// `fetch_pobb_code` command (no CORS proxy needed, unlike upstream).
// The heavy gem/quest data loads lazily through the leveling vendor module.

import { resolveCode, zlibInflate } from '$lib/pob';
import {
  setLevelingBuild,
  poe1GemProgress,
  switchActiveEdgeScope,
  deletePoe1GemProgressFor,
  deleteActiveEdgeProgressFor,
  GEM_PROGRESS_KEY,
  EDGE_KEY,
  type Bandit,
  type LevelingBuild,
} from '$lib/levelingRoute.svelte';
import { poe1LevelingProgress, LEVELING_PROGRESS_KEY, deletePoe1LevelingProgressFor } from '$lib/poe1LevelingProgress.svelte';

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

/** A named skill set (one PoB "SkillSet" tab — builds can have several,
 *  switched independently of item/tree loadouts). */
export interface Poe1SkillSet {
  id: string;
  title: string;
  gemLinks: Poe1GemLinkGroup[];
}

export interface Poe1Build extends LevelingBuild {
  buildTrees: Poe1BuildTree[];
  /** Index into buildTrees matching PoB's <Tree activeSpec>. */
  activeTreeIndex: number;
  skillSets: Poe1SkillSet[];
  /** Index into skillSets matching PoB's <Skills activeSkillSet>. */
  activeSkillSet: number;
  importedAt: number;
}

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

  // Returns this set's own gem-link groups; also accumulates into the shared
  // requiredGems union above (every set's gems are worth grabbing while
  // leveling, regardless of which set ends up active).
  const processSkills = (parent: Element, parentTitle: string | undefined): Poe1GemLinkGroup[] => {
    const setGemLinks: Poe1GemLinkGroup[] = [];
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
        setGemLinks.push({
          title,
          primary: primaryIds.map(toLinkGem),
          secondary: secondaryIds.map(toLinkGem),
        });
      } else if (secondaryIds.length > 0) {
        setGemLinks.push({ title, primary: secondaryIds.map(toLinkGem), secondary: [] });
      }
    }
    return setGemLinks;
  };

  const skillsEl = doc.getElementsByTagName('Skills')[0];
  const activeSkillSetId = skillsEl?.getAttribute('activeSkillSet') ?? '1';
  const skillSetEls = Array.from(doc.getElementsByTagName('SkillSet'));

  const skillSets: Poe1SkillSet[] =
    skillSetEls.length > 0
      ? skillSetEls.map((setEl, i) => ({
          id: setEl.getAttribute('id') ?? String(i + 1),
          title: cleanPobText(setEl.getAttribute('title') || `Skill Set ${i + 1}`),
          gemLinks: processSkills(setEl, setEl.getAttribute('title') ?? undefined),
        }))
      : [{ id: '1', title: 'Default', gemLinks: processSkills(doc.documentElement, undefined) }];

  const activeSkillSet = Math.max(
    0,
    skillSets.findIndex((s) => s.id === activeSkillSetId),
  );

  // PoB's <Tree activeSpec> is a 1-based position among ALL <Spec> elements —
  // track which one lands at which index in buildTrees as specs missing a
  // url/version get dropped.
  const treeEl = doc.getElementsByTagName('Tree')[0];
  const activeSpecPos = parseInt(treeEl?.getAttribute('activeSpec') ?? '1', 10) - 1;

  const buildTrees: Poe1BuildTree[] = [];
  let activeTreeIndex = 0;
  Array.from(doc.getElementsByTagName('Spec')).forEach((specEl, i) => {
    const url = specEl.getElementsByTagName('URL')[0]?.textContent?.trim();
    const version = specEl.getAttribute('treeVersion');
    if (!url || !version) return;
    if (i === activeSpecPos) activeTreeIndex = buildTrees.length;
    buildTrees.push({
      name: cleanPobText(specEl.getAttribute('title') || 'Default'),
      version,
      url,
    });
  });

  const build: Poe1Build = {
    characterClass,
    bandit,
    requiredGems,
    buildTrees,
    activeTreeIndex,
    skillSets,
    activeSkillSet,
    importedAt: Date.now(),
  };

  addPoe1Build(build);
  return build;
}

// ── Persistence: multi-build store ──────────────────────────────────────────
//
// Users can import and keep several builds (different characters/leagues) and
// switch which one is "active". Each stored build tracks its own leveling
// progress, gem progress, and auto-progress position (see
// poe1LevelingProgress.svelte.ts / levelingRoute.svelte.ts's poe1GemProgress +
// switchActiveEdgeScope) — switching the active build swaps all three scopes
// together via setActivePoe1Build, so checkmarks never bleed between builds.
// The unsuffixed default bucket those stores fall back to when no build is
// active is the same key they always used before multi-build support existed,
// so someone who's never imported a build keeps working exactly as before.

export interface StoredPoe1Build {
  id: string;
  build: Poe1Build;
}

interface Poe1BuildStore {
  builds: StoredPoe1Build[]; // newest first
  activeId: string | null;
}

const STORE_KEY = 'EXILECOMPASS_POE1_POB_STORE_V1';
const LEGACY_KEY = 'EXILECOMPASS_POE1_POB_V2';

// Keep stored builds bounded — importing past this evicts the oldest entry
// (the newly-imported one is always newest, so it's never the one evicted).
const MAX_STORED_BUILDS = 20;

function emptyStore(): Poe1BuildStore {
  return { builds: [], activeId: null };
}

/** One-time migration from the pre-multi-build single-build key. Wraps the
 *  legacy build as the store's first entry and copies (not moves — the
 *  unsuffixed keys keep serving as the "no active build" default bucket
 *  afterward) its flat progress/gem/edge state into that build's scoped
 *  slots, so an existing user doesn't lose anything on upgrade. No-op if
 *  there's no legacy build (fresh install) or the store already exists. */
function migrateLegacyIfNeeded() {
  try {
    if (window.localStorage.getItem(STORE_KEY)) return;
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;

    const legacyBuild = JSON.parse(legacyRaw) as Poe1Build;
    const id = crypto.randomUUID();

    for (const base of [LEVELING_PROGRESS_KEY, GEM_PROGRESS_KEY, EDGE_KEY]) {
      const val = window.localStorage.getItem(base);
      if (val !== null) window.localStorage.setItem(`${base}_${id}`, val);
    }

    saveStore({ builds: [{ id, build: legacyBuild }], activeId: id });
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore corrupt legacy state — start fresh */
  }
}

function loadStore(): Poe1BuildStore {
  migrateLegacyIfNeeded();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Poe1BuildStore;
  } catch {
    /* ignore corrupt state */
  }
  return emptyStore();
}

function saveStore(store: Poe1BuildStore) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage full / blocked */
  }
}

/** Every stored build, newest first — for the Settings "Saved Builds" list. */
export function listPoe1Builds(): StoredPoe1Build[] {
  return loadStore().builds;
}

export function activePoe1BuildId(): string | null {
  return loadStore().activeId;
}

/** The currently active build's data, or null if none is active. */
export function loadPoe1Build(): Poe1Build | null {
  const store = loadStore();
  return store.builds.find((b) => b.id === store.activeId)?.build ?? null;
}

/** Point the route + all three per-build progress scopes at `id` (or the
 *  default bucket when `id` is null). Persists the choice as the active
 *  build. Central switch point so every side effect of "changing which build
 *  is active" happens together. */
export async function setActivePoe1Build(id: string | null): Promise<void> {
  const store = loadStore();
  if (id !== null && !store.builds.some((b) => b.id === id)) return;
  store.activeId = id;
  saveStore(store);

  const build = store.builds.find((b) => b.id === id)?.build ?? null;
  await setLevelingBuild(build);
  poe1LevelingProgress.switchScope(id);
  poe1GemProgress.switchScope(id);
  switchActiveEdgeScope(id);
}

/** Add a newly-imported build as a new entry and make it active — never
 *  silently overwrites a previous build. */
function addPoe1Build(build: Poe1Build): void {
  const store = loadStore();
  const id = crypto.randomUUID();
  store.builds.unshift({ id, build });

  // builds is newest-first, so the oldest entry (which is never the one just
  // added) is always last — evict it and its progress state if over the cap.
  if (store.builds.length > MAX_STORED_BUILDS) {
    const evicted = store.builds.pop();
    if (evicted) {
      deletePoe1LevelingProgressFor(evicted.id);
      deletePoe1GemProgressFor(evicted.id);
      deleteActiveEdgeProgressFor(evicted.id);
    }
  }

  store.activeId = id;
  saveStore(store);
  void setActivePoe1Build(id);
}

/** Remove a stored build and its per-build progress/gem/edge state. If it was
 *  active, falls back to no active build (the default progress bucket). */
export function removePoe1Build(id: string): void {
  const store = loadStore();
  store.builds = store.builds.filter((b) => b.id !== id);
  const wasActive = store.activeId === id;
  if (wasActive) store.activeId = null;
  saveStore(store);

  deletePoe1LevelingProgressFor(id);
  deletePoe1GemProgressFor(id);
  deleteActiveEdgeProgressFor(id);

  if (wasActive) void setActivePoe1Build(null);
}

/** Restore the active build into the route + progress stores on startup
 *  (called from every PoE1 view's onMount — see PoE1LevelingGuide.svelte,
 *  GemLinksViewer.svelte, PassiveTreeViewer.svelte). */
export async function restorePoe1Build(): Promise<void> {
  await setActivePoe1Build(activePoe1BuildId());
}

/** Deactivate the current build without deleting it from the store (distinct
 *  from removePoe1Build, which deletes it entirely) — the Settings "Clear"
 *  button next to Import. */
export async function clearPoe1Build(): Promise<void> {
  await setActivePoe1Build(null);
}
