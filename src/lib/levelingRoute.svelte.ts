// Runtime PoE1 leveling route.
//
// Replaces the old build-time generator (tools/build-poe1-leveling.mjs):
// the exile-leveling DSL is parsed in the app (it's ~30KB of text, ms-scale),
// which lets the route react to build config (bandit / league-start / library
// #ifdefs) and lets an imported Path of Building build splice gem-reward
// steps after the quests that award them — mirroring upstream's two-pass
// baseRoute -> route-with-gems architecture (web/src/state/route.ts).
//
// The vendored parser + its ~600KB of game data load lazily via dynamic
// import, so PoE2-only sessions never pay for any of it.

import { SvelteSet } from 'svelte/reactivity';

// ── Public display types (same shapes the guide component always rendered) ──

export type LevelingPart =
  | { type: 'text'; value: string }
  | { type: 'kill'; value: string }
  | { type: 'arena'; value: string }
  | { type: 'area'; name: string; isTown: boolean; level: number | null }
  | { type: 'enter'; name: string; isTown: boolean; level: number | null }
  | { type: 'logout'; name: string; isTown: boolean; level: number | null }
  | { type: 'waypoint' }
  | { type: 'waypoint_use'; name: string; crossesAct: number | null }
  | { type: 'waypoint_get' }
  | { type: 'portal_set' }
  | { type: 'portal_use'; name: string; isTown: boolean; level: number | null }
  | { type: 'quest'; name: string; npcs: string[] }
  | { type: 'quest_text'; value: string }
  | { type: 'generic'; value: string }
  | { type: 'reward_quest'; item: string }
  | { type: 'reward_vendor'; item: string; cost: string | null }
  | { type: 'trial' }
  | { type: 'ascend'; version: string }
  | { type: 'crafting'; recipes: string[] }
  | { type: 'dir'; dirIndex: number }
  | { type: 'copy'; text: string };

export interface LevelingFragmentStep {
  kind: 'fragment';
  id: string;
  parts: LevelingPart[];
  subSteps: { id: string; parts: LevelingPart[] }[];
}

export interface LevelingGemStep {
  kind: 'gem';
  id: string;
  gemId: string;
  name: string;
  /** Gem colour by primary attribute (from gem-colours.json). */
  colour: string;
  rewardType: 'quest' | 'vendor';
  count: number;
  /** Vendor-only orb hint derived from required_level (upstream's heuristic). */
  cost: string | null;
  /** The PoB skill-group label this gem belongs to. */
  note: string;
}

export type LevelingStep = LevelingFragmentStep | LevelingGemStep;

export interface LevelingSection {
  id: string;
  name: string;
  steps: LevelingStep[];
}

export type Bandit = 'None' | 'Oak' | 'Kraityn' | 'Alira';

export interface LevelingRouteConfig {
  leagueStart: boolean;
  library: boolean;
  /** Splice gem-reward steps from an imported build into the route. */
  showGems: boolean;
  /** Show a "you are here" indicator + auto-scroll as the log reports zone
   *  entries matching the route's expected sequence. Never affects step
   *  completion — that stays fully manual. */
  autoProgress: boolean;
}

/** Imported PoE1 build data relevant to the route (set by poe1Pob.ts). */
export interface LevelingBuild {
  characterClass: string;
  bandit: Bandit;
  requiredGems: { id: string; note: string; count: number }[];
}

const CONFIG_KEY = 'EXILECOMPASS_POE1_ROUTE_CONFIG_V1';
// Exported (along with GEM_PROGRESS_KEY below) so poe1Pob.ts's legacy-build
// migration can copy these exact base keys' values into a newly-migrated
// build's scoped slots without duplicating the literal strings.
export const EDGE_KEY = 'EXILECOMPASS_POE1_AUTO_PROGRESS_EDGE_V1';

// ── Reactive state ──────────────────────────────────────────────────────────

let _sections = $state<LevelingSection[]>([]);
let _loading = $state(false);
let _error = $state('');
let _config = $state<LevelingRouteConfig>({ leagueStart: true, library: true, showGems: true, autoProgress: true });
let _build = $state<LevelingBuild | null>(null);

// Flat ordered list of checkable step ids (fragment + gem), rebuilt with the
// route — drives the completeNext/undoLast hotkeys.
let _ordered: { id: string; kind: 'fragment' | 'gem'; gemId?: string }[] = [];

// ── Auto-progress (position tracking, not completion) ───────────────────────
// Mirrors upstream exile-leveling's `activeEdgeAtom`: `edges` is the parsed
// route's flat, in-order sequence of PoE area ids representing zone
// transitions; `_activeEdgeIndex` tracks how far along that sequence the
// player has gotten, advanced by matching live log-detected area ids
// (see advanceLevelingEdge). `_edgeSteps[i]` is our own step id for whichever
// rendered step corresponds to edges[i], so the UI can show/scroll to it.
// Entirely separate from completion state (poe1LevelingProgress/poe1GemProgress).
let _edges: string[] = [];
let _edgeSteps: (string | null)[] = [];
let _activeEdgeIndex = $state(0);

// Scoped per active PoB build (see poe1Pob.ts's build store), same reasoning
// as poe1LevelingProgress/poe1GemProgress below: each build tracks its own
// "you are here" position. `null` (no build active) uses the unsuffixed
// default key, matching this store's pre-multi-build behavior.
function edgeKeyFor(buildId: string | null): string {
  return buildId ? `${EDGE_KEY}_${buildId}` : EDGE_KEY;
}

let _edgeKey: string = EDGE_KEY;

/** Point the active-edge tracker at a build's saved position (or the default
 *  bucket when `buildId` is null) and load it. Call on startup and whenever
 *  the active build changes (see poe1Pob.ts's setActivePoe1Build). */
export function switchActiveEdgeScope(buildId: string | null) {
  _edgeKey = edgeKeyFor(buildId);
  try {
    const raw = window.localStorage.getItem(_edgeKey);
    _activeEdgeIndex = raw ? (JSON.parse(raw).activeEdgeIndex ?? 0) : 0;
  } catch {
    _activeEdgeIndex = 0;
  }
}

/** Delete a specific build's saved edge position — called when that build is
 *  removed from the store (poe1Pob.ts). */
export function deleteActiveEdgeProgressFor(buildId: string) {
  try {
    window.localStorage.removeItem(edgeKeyFor(buildId));
  } catch {
    /* ignore */
  }
}

function saveActiveEdgeIndex() {
  try {
    window.localStorage.setItem(_edgeKey, JSON.stringify({ activeEdgeIndex: _activeEdgeIndex }));
  } catch {
    /* ignore */
  }
}

// How far ahead of the current edge to search for a match. The area id we
// match against comes from logWatcher.ts's extractAreaId, which only fires
// on "Generating level N area ...\" — logged once, the *first* time a PoE
// instance is created. Backtracking into an already-generated instance (a
// route leg that returns through recently-visited zones, e.g. Act 1's
// Flooded Depths -> boat back through Submerged Passage/Ledge/Climb/Lower
// Prison -> town -> Lower Prison again) produces zero log lines for those
// edges, since none of them regenerate. Matching only the immediate next
// edge would desync permanently at the first such backtrack, waiting on
// edges that will never fire. Searching a bounded window ahead instead lets
// the next genuinely-new instance (the next real regeneration event) resync
// the marker past whatever revisits were silently missed, without risking a
// wild jump from an unrelated coincidental id match far down the route.
const EDGE_LOOKAHEAD = 20;

/** Called with the PoE area id from each newly-detected log line. No-ops if
 *  auto-progress is turned off or no upcoming edge (within EDGE_LOOKAHEAD)
 *  matches. Never jumps backward — only ever advances toward the closest
 *  matching edge ahead of the current position.
 *
 *  Deliberately does *not* auto-detect "new character" from log content
 *  (an earlier version snapped back to edge 0 whenever it saw area id
 *  "1_1_1", The Twilight Strand — assuming that's a one-time zone an
 *  existing character can never regenerate). That assumption isn't
 *  something this function can verify from a single area id in isolation,
 *  and a wrong guess permanently desyncs the marker with no way back
 *  except noticing and undoing it. Upstream doesn't auto-detect this
 *  either — its equivalent reset only fires on an explicit user action
 *  (clearing/re-importing a PoB build, see exile-leveling's pob/index.ts).
 *  For a genuine new character here, use the manual "jump to here" marker
 *  on the first step instead (see `jumpToEdge`). */
export function advanceLevelingEdge(areaId: string) {
  if (!_config.autoProgress) return;
  const end = Math.min(_activeEdgeIndex + 1 + EDGE_LOOKAHEAD, _edges.length);
  for (let i = _activeEdgeIndex + 1; i < end; i++) {
    if (_edges[i] === areaId) {
      _activeEdgeIndex = i;
      saveActiveEdgeIndex();
      return;
    }
  }
}

/** Manual override — click a step's position marker to jump there directly.
 *  Cheap escape hatch if live detection ever desyncs from the actual route. */
export function jumpToEdge(index: number) {
  if (index < 0 || index >= _edges.length) return;
  _activeEdgeIndex = index;
  saveActiveEdgeIndex();
}

export const levelingRoute = {
  get sections() {
    return _sections;
  },
  get loading() {
    return _loading;
  },
  get error() {
    return _error;
  },
  get config() {
    return _config;
  },
  get build() {
    return _build;
  },
  /** The step id currently marked "you are here", or null before the route
   *  has loaded / if the route has no edges. */
  get activeStepId() {
    return _edgeSteps[_activeEdgeIndex] ?? null;
  },
  /** Whether a given step id has an edge (and can be clicked to jump to). */
  edgeIndexForStep(stepId: string): number | null {
    const idx = _edgeSteps.indexOf(stepId);
    return idx >= 0 ? idx : null;
  },
};

// ── Vendored module (lazy) ──────────────────────────────────────────────────

type Vendor = typeof import('./leveling/vendor/index.js');
let vendorPromise: Promise<{ vendor: Vendor; sources: string[] }> | null = null;

function loadVendor() {
  vendorPromise ??= Promise.all([
    import('./leveling/vendor/index.js'),
    import('./leveling/routeSources.js'),
  ]).then(([vendor, src]) => ({ vendor, sources: src.ROUTE_SOURCES }));
  return vendorPromise;
}

// ── Config / build inputs ───────────────────────────────────────────────────

export function loadRouteConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _config = {
        leagueStart: parsed.leagueStart !== false,
        library: parsed.library !== false,
        showGems: parsed.showGems !== false,
        autoProgress: parsed.autoProgress !== false,
      };
    }
  } catch {
    /* ignore corrupt state */
  }
}

export async function setRouteConfig(partial: Partial<LevelingRouteConfig>) {
  _config = { ..._config, ...partial };
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(_config));
  } catch {
    /* ignore */
  }
  await rebuildRoute();
}

/** Called by poe1Pob.ts on import/clear. Triggers a route rebuild. */
export async function setLevelingBuild(build: LevelingBuild | null) {
  _build = build;
  await rebuildRoute();
}

// ── Parse + gem splice ──────────────────────────────────────────────────────

let loadedOnce = false;

export async function ensureRouteLoaded() {
  if (loadedOnce) return;
  await rebuildRoute();
}

export async function rebuildRoute() {
  loadedOnce = true;
  _loading = true;
  _error = '';
  try {
    const { vendor, sources } = await loadVendor();
    _sections = buildSections(vendor, sources);
  } catch (e) {
    _error = String(e);
    _sections = [];
  } finally {
    _loading = false;
  }
}

function buildSections(vendor: Vendor, sources: string[]): LevelingSection[] {
  const { Data, getRouteFiles, initializeRouteState, parseRoute, buildGemSteps, findCharacterGems } =
    vendor;

  const routeFiles = getRouteFiles(sources);
  const state = initializeRouteState();

  if (_config.leagueStart) state.preprocessorDefinitions.add('LEAGUE_START');
  if (_config.library) state.preprocessorDefinitions.add('LIBRARY');
  switch (_build?.bandit ?? 'Alira') {
    case 'None':
      state.preprocessorDefinitions.add('BANDIT_KILL');
      break;
    case 'Oak':
      state.preprocessorDefinitions.add('BANDIT_OAK');
      break;
    case 'Kraityn':
      state.preprocessorDefinitions.add('BANDIT_KRAITYN');
      break;
    case 'Alira':
      state.preprocessorDefinitions.add('BANDIT_ALIRA');
      break;
  }

  const baseRoute = parseRoute(routeFiles, state);

  // Gem splice inputs — shared, order-dependent across the whole route
  // (upstream quirk preserved: one sequential pass).
  const buildData = _build
    ? { characterClass: _build.characterClass, bandit: _build.bandit, leagueStart: _config.leagueStart, library: _config.library }
    : null;
  const requiredGems = _config.showGems && _build ? _build.requiredGems.map((g) => ({ ...g })) : [];
  const questGems = new Set<number>();
  const vendorGems = new Set<number>();
  if (buildData && requiredGems.length > 0) {
    findCharacterGems(buildData, requiredGems, questGems);
  }

  const ordered: typeof _ordered = [];
  const sections: LevelingSection[] = [];
  const edgeSteps: (string | null)[] = baseRoute.edges.map(() => null);

  type AreaLike = { name: string; is_town_area: boolean; level: number | null; map_name?: string | null; act?: number };
  const resolveArea = (areaId: string) => {
    const area = Data.Areas[areaId] as AreaLike;
    return { name: area.name, isTown: area.is_town_area, level: area.level ?? null };
  };

  const resolveFragment = (fragment: unknown): LevelingPart => {
    if (typeof fragment === 'string') return { type: 'text', value: fragment };
    const f = fragment as { type: string } & Record<string, unknown>;
    switch (f.type) {
      case 'kill':
        return { type: 'kill', value: f.value as string };
      case 'arena':
        return { type: 'arena', value: f.value as string };
      case 'area':
        return { type: 'area', ...resolveArea(f.areaId as string) };
      case 'enter':
        return { type: 'enter', ...resolveArea(f.areaId as string) };
      case 'logout':
        return { type: 'logout', ...resolveArea(f.areaId as string) };
      case 'waypoint':
        return { type: 'waypoint' };
      case 'waypoint_use': {
        const dst = Data.Areas[f.dstAreaId as string] as AreaLike;
        const src = Data.Areas[f.srcAreaId as string] as AreaLike;
        return {
          type: 'waypoint_use',
          name: (dst.map_name || dst.name) as string,
          crossesAct: dst.act !== src.act ? (dst.act ?? null) : null,
        };
      }
      case 'waypoint_get':
        return { type: 'waypoint_get' };
      case 'portal_set':
        return { type: 'portal_set' };
      case 'portal_use':
        return { type: 'portal_use', ...resolveArea(f.dstAreaId as string) };
      case 'quest': {
        const quest = Data.Quests[f.questId as string];
        const npcs = [
          ...new Set(
            (f.rewardOffers as string[])
              .map((offerId) => quest.reward_offers[offerId]?.quest_npc)
              .filter((npc): npc is string => !!npc),
          ),
        ];
        return { type: 'quest', name: quest.name, npcs };
      }
      case 'quest_text':
        return { type: 'quest_text', value: f.value as string };
      case 'generic':
        return { type: 'generic', value: f.value as string };
      case 'reward_quest':
        return { type: 'reward_quest', item: f.item as string };
      case 'reward_vendor':
        return { type: 'reward_vendor', item: f.item as string, cost: (f.cost as string) ?? null };
      case 'trial':
        return { type: 'trial' };
      case 'ascend':
        return { type: 'ascend', version: f.version as string };
      case 'crafting':
        return { type: 'crafting', recipes: f.crafting_recipes as string[] };
      case 'dir':
        return { type: 'dir', dirIndex: f.dirIndex as number };
      case 'copy':
        return { type: 'copy', text: f.text as string };
      default:
        return { type: 'generic', value: JSON.stringify(fragment) };
    }
  };

  // Upstream's level→orb heuristic (GemCost component), rendered as text.
  const orbFor = (requiredLevel: number): string => {
    if (requiredLevel < 8) return 'Wisdom';
    if (requiredLevel < 16) return 'Transmutation';
    if (requiredLevel < 28) return 'Alteration';
    if (requiredLevel < 38) return 'Chance';
    return 'Alchemy';
  };

  baseRoute.sections.forEach((section, sectionIdx) => {
    const actId = `act${sectionIdx + 1}`;
    const steps: LevelingStep[] = [];
    let gemCounter = 0;

    section.steps.forEach((baseStep, stepIdx) => {
      if (baseStep.type !== 'fragment_step') return;
      // Id scheme matches the old static generator (act{n}-{i}) so existing
      // saved progress carries over for the default config.
      const id = `${actId}-${stepIdx}`;
      if (baseStep.edgeIndex !== null) edgeSteps[baseStep.edgeIndex] = id;

      // Gem steps for this step's quest fragments (only when a build is set).
      const gemSteps: LevelingGemStep[] = [];
      if (buildData && requiredGems.length > 0) {
        for (const part of baseStep.parts) {
          if (typeof part === 'string' || part.type !== 'quest') continue;
          for (const gs of buildGemSteps(part, buildData, requiredGems, questGems, vendorGems)) {
            const gem = Data.Gems[gs.requiredGem.id];
            gemSteps.push({
              kind: 'gem',
              id: `${id}-gem${gemCounter++}`,
              gemId: gs.requiredGem.id,
              name: gem.name,
              colour: Data.GemColours[gem.primary_attribute] ?? '#ffffff',
              rewardType: gs.rewardType,
              count: gs.count,
              cost: gs.rewardType === 'vendor' ? orbFor(gem.required_level) : null,
              note: gs.requiredGem.note,
            });
          }
        }
      }

      const parts = baseStep.parts.map(resolveFragment);
      // In-game search string for the awarded gems, like upstream.
      if (gemSteps.length > 0) {
        const search = gemSteps.map((g) => g.name).join('|');
        parts.push({ type: 'copy', text: `"${search}"` });
      }

      steps.push({
        kind: 'fragment',
        id,
        parts,
        subSteps: (baseStep.subSteps ?? []).map((sub, j) => ({
          id: `${id}-${j}`,
          parts: sub.parts.map(resolveFragment),
        })),
      });
      ordered.push({ id, kind: 'fragment' });

      for (const gs of gemSteps) {
        steps.push(gs);
        ordered.push({ id: gs.id, kind: 'gem', gemId: gs.gemId });
      }
    });

    sections.push({ id: actId, name: section.name, steps });
  });

  _ordered = ordered;
  _edges = baseRoute.edges;
  _edgeSteps = edgeSteps;
  // A config change (bandit/league-start/library) rebuilds `edges` from
  // scratch — clamp rather than reset, same limitation upstream has (the
  // index is a raw position, not re-derived from semantic state).
  if (_activeEdgeIndex >= _edges.length) _activeEdgeIndex = Math.max(0, _edges.length - 1);
  return sections;
}

// ── Progress-integration helpers ────────────────────────────────────────────
// Completion state lives in poe1LevelingProgress (fragment steps, by step id)
// and poe1GemProgress (gem steps, by gem id — one checkbox state per gem, as
// upstream does). These helpers drive the global hotkeys across both.

import { poe1LevelingProgress } from '$lib/poe1LevelingProgress.svelte';

export const GEM_PROGRESS_KEY = 'EXILECOMPASS_POE1_GEM_PROGRESS_V1';

// Scoped per active PoB build, same reasoning as poe1LevelingProgress.svelte.ts.
function gemProgressKeyFor(buildId: string | null): string {
  return buildId ? `${GEM_PROGRESS_KEY}_${buildId}` : GEM_PROGRESS_KEY;
}

class Poe1GemProgress {
  completed = $state(new SvelteSet<string>());
  #currentKey: string = GEM_PROGRESS_KEY;

  /** Point this store at a build's gem progress (or the default bucket when
   *  `buildId` is null) and load whatever's saved there. Safe to call
   *  repeatedly — on startup, and again any time the active build changes. */
  switchScope(buildId: string | null) {
    this.#currentKey = gemProgressKeyFor(buildId);
    try {
      const raw = window.localStorage.getItem(this.#currentKey);
      this.completed = raw ? new SvelteSet<string>(JSON.parse(raw)) : new SvelteSet<string>();
    } catch {
      this.completed = new SvelteSet<string>();
    }
  }

  #save() {
    window.localStorage.setItem(this.#currentKey, JSON.stringify([...this.completed]));
  }

  has(gemId: string): boolean {
    return this.completed.has(gemId);
  }

  toggle(gemId: string) {
    if (this.completed.has(gemId)) this.completed.delete(gemId);
    else this.completed.add(gemId);
    this.#save();
  }

  setMany(gemIds: string[], done: boolean) {
    for (const id of gemIds) {
      if (done) this.completed.add(id);
      else this.completed.delete(id);
    }
    this.#save();
  }

  resetAll() {
    this.completed = new SvelteSet<string>();
    this.#save();
  }
}

export const poe1GemProgress = new Poe1GemProgress();

/** Delete a specific build's stored gem progress — called when that build is
 *  removed from the store (poe1Pob.ts). */
export function deletePoe1GemProgressFor(buildId: string) {
  try {
    window.localStorage.removeItem(gemProgressKeyFor(buildId));
  } catch {
    /* ignore */
  }
}

function isDone(entry: (typeof _ordered)[number]): boolean {
  return entry.kind === 'gem'
    ? poe1GemProgress.has(entry.gemId!)
    : poe1LevelingProgress.has(entry.id);
}

/** Mark the next incomplete step (fragment or gem) done. Used by the global hotkey. */
export function levelingCompleteNext(): string | null {
  for (const entry of _ordered) {
    if (isDone(entry)) continue;
    if (entry.kind === 'gem') poe1GemProgress.toggle(entry.gemId!);
    else poe1LevelingProgress.toggle(entry.id);
    return entry.id;
  }
  return null;
}

/** Un-mark the last completed step (inverse of levelingCompleteNext). */
export function levelingUndoLast(): string | null {
  for (let i = _ordered.length - 1; i >= 0; i--) {
    const entry = _ordered[i];
    if (!isDone(entry)) continue;
    if (entry.kind === 'gem') poe1GemProgress.toggle(entry.gemId!);
    else poe1LevelingProgress.toggle(entry.id);
    return entry.id;
  }
  return null;
}
