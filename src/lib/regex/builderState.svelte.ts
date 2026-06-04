// Reactive state for the regex builder (Svelte 5 runes). A module singleton so
// the user's in-progress build survives switching away from and back to the
// Stash tab. Mirrors the getter-based pattern in src/lib/overlay.svelte.ts.

import { persistGet, persistSet } from '$lib/persist';
import { defaultSettings, type Category, type ModGroup, type Settings } from './settings';
import type { SelectOption } from './types';
import {
  loadWaystoneAffixes,
  loadTabletAffixes,
  type WaystoneAffix,
  type TabletAffix,
} from './loaders';
import { relicRegex } from './relicData';
import { generateVendorRegex } from './generators/vendor';
import { generateWaystoneRegex } from './generators/waystone';
import { generateTabletRegex } from './generators/tablet';
import { generateRelicRegex } from './generators/relic';
import { importRegex } from './import';

export interface Favorite {
  id: number;
  name: string;
  category: Category;
  regex: string;
}

const FAVORITES_KEY = 'REGEX_FAVORITES_V1';

// Relic options are static (bundled), split into the two affix slots up front.
// `id` is the index into relicRegex so the import matcher can recover the slot.
const relicOptions: { id: number; name: string; regex: string; ranges: number[][]; affix: string }[] =
  relicRegex.map((e, i) => ({
    id: i,
    name: e.name,
    regex: e.regex,
    ranges: e.ranges,
    affix: e.affix,
  }));

// ── State ──────────────────────────────────────────────────────────────────
let _category = $state<Category>('vendor');
let _settings = $state<Settings>(defaultSettings());
// Active group (where new selections land) per category.
let _activeGroup = $state<Record<Category, number>>({ vendor: 0, waystone: 0, tablet: 0, relic: 0 });
let _waystoneAffixes = $state<WaystoneAffix[]>([]);
let _tabletAffixes = $state<TabletAffix[]>([]);
let _favorites = $state<Favorite[]>([]);
let _loaded = $state(false);
let _importNote = $state('');

const _result = $derived.by(() => {
  switch (_category) {
    case 'vendor':
      return generateVendorRegex(_settings);
    case 'waystone':
      return generateWaystoneRegex(_settings);
    case 'tablet':
      return generateTabletRegex(_settings);
    case 'relic':
      return generateRelicRegex(_settings);
  }
});

// ── Public API ───────────────────────────────────────────────────────────────
export const builder = {
  get category() {
    return _category;
  },
  set category(c: Category) {
    _category = c;
    _importNote = '';
  },
  get settings() {
    return _settings;
  },
  get waystoneAffixes() {
    return _waystoneAffixes;
  },
  get tabletAffixes() {
    return _tabletAffixes;
  },
  get relicPrefixes() {
    return relicOptions.filter((o) => o.affix === 'PREFIX');
  },
  get relicSuffixes() {
    return relicOptions.filter((o) => o.affix === 'SUFFIX');
  },
  // Groups + active group for the current category.
  get groups(): ModGroup[] {
    return _settings[_category].groups;
  },
  get activeGroup() {
    return _activeGroup[_category];
  },
  set activeGroup(i: number) {
    _activeGroup[_category] = i;
  },
  get result() {
    return _result;
  },
  get favorites() {
    return _favorites;
  },
  get loaded() {
    return _loaded;
  },
  get importNote() {
    return _importNote;
  },
};

// ── Lifecycle ──────────────────────────────────────────────────────────────
let initialized = false;
export async function initBuilder(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const [way, tab, favRaw] = await Promise.all([
    loadWaystoneAffixes(),
    loadTabletAffixes(),
    persistGet(FAVORITES_KEY),
  ]);
  _waystoneAffixes = way;
  _tabletAffixes = tab;
  if (favRaw) {
    try {
      _favorites = JSON.parse(favRaw) as Favorite[];
    } catch {
      _favorites = [];
    }
  }
  _loaded = true;
}

// ── Group helpers ────────────────────────────────────────────────────────────
// All operate on the current category's live groups (a $state proxy).
type Template = { id?: number; name: string; regex: string; ranges: number[][] };

function groups(): ModGroup[] {
  return _settings[_category].groups;
}

// Which group index currently holds the option with this id, or -1.
export function conditionGroupOf(id: number | undefined): number {
  if (id === undefined) return -1;
  return groups().findIndex((g) => g.conditions.some((c) => c.id === id));
}

export function findCondition(id: number | undefined): SelectOption | undefined {
  if (id === undefined) return undefined;
  for (const g of groups()) {
    const hit = g.conditions.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

// Toggle an option: remove if it's in the active group, move it here if it's in
// another group, otherwise add it to the active group.
export function toggleCondition(template: Template): void {
  const gs = groups();
  const active = Math.min(_activeGroup[_category], gs.length - 1);
  const at = conditionGroupOf(template.id);
  if (at === active && at >= 0) {
    const ci = gs[at].conditions.findIndex((c) => c.id === template.id);
    gs[at].conditions.splice(ci, 1);
  } else if (at >= 0) {
    const ci = gs[at].conditions.findIndex((c) => c.id === template.id);
    const [cond] = gs[at].conditions.splice(ci, 1);
    gs[active].conditions.push(cond);
  } else {
    gs[active].conditions.push({ ...template, value: null, isSelected: true });
  }
}

export function setConditionValue(id: number | undefined, value: number | null): void {
  const cond = findCondition(id);
  if (cond) cond.value = value;
}

export function removeConditionAt(groupIndex: number, condIndex: number): void {
  groups()[groupIndex]?.conditions.splice(condIndex, 1);
}

export function addGroup(): void {
  const gs = groups();
  const nextId = gs.reduce((m, g) => Math.max(m, g.id), -1) + 1;
  gs.push({ id: nextId, conditions: [] });
  _activeGroup[_category] = gs.length - 1;
}

export function removeGroup(index: number): void {
  const gs = groups();
  if (gs.length <= 1) {
    gs[0].conditions = [];
  } else {
    gs.splice(index, 1);
  }
  _activeGroup[_category] = Math.min(_activeGroup[_category], groups().length - 1);
}

// ── Plain array multiselect (waystone "unwanted mods" — not grouped) ──────────
export function arrayCondition(arr: SelectOption[], id: number | undefined): SelectOption | undefined {
  return arr.find((o) => o.id === id);
}

export function toggleArrayCondition(arr: SelectOption[], template: Template): void {
  const idx = arr.findIndex((o) => o.id === template.id);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push({ ...template, value: null, isSelected: true });
}

export function setArrayValue(arr: SelectOption[], id: number | undefined, value: number | null): void {
  const opt = arr.find((o) => o.id === id);
  if (opt) opt.value = value;
}

// ── Actions ──────────────────────────────────────────────────────────────────
// Reset the entire builder — all four categories, custom text and excludes —
// not just the active one.
export function resetAll(): void {
  _settings = defaultSettings();
  _activeGroup = { vendor: 0, waystone: 0, tablet: 0, relic: 0 };
  _importNote = '';
}

export function doImport(raw: string): void {
  if (!raw.trim()) return;
  const { recognised, leftover } = importRegex(
    _category,
    raw,
    _settings,
    { waystone: _waystoneAffixes, tablet: _tabletAffixes },
  );
  _activeGroup[_category] = 0;
  _importNote =
    recognised > 0
      ? `Matched ${recognised} option${recognised === 1 ? '' : 's'}${leftover ? ' · rest kept as custom text' : ''}`
      : 'No options matched — kept as custom text';
}

async function persistFavorites(): Promise<void> {
  await persistSet(FAVORITES_KEY, JSON.stringify(_favorites));
}

export async function saveFavorite(name: string): Promise<void> {
  const regex = _result.trim();
  if (!regex) return;
  _favorites = [..._favorites, { id: Date.now(), name: name.trim() || 'Untitled', category: _category, regex }];
  await persistFavorites();
}

export async function deleteFavorite(id: number): Promise<void> {
  _favorites = _favorites.filter((f) => f.id !== id);
  await persistFavorites();
}

export function applyFavorite(fav: Favorite): void {
  _category = fav.category;
  const fresh = defaultSettings();
  _settings[fav.category] = fresh[fav.category] as never;
  _activeGroup[fav.category] = 0;
  doImport(fav.regex);
}
