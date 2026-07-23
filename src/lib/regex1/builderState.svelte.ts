// Reactive state for the PoE1 Regex tab (Svelte 5 runes), mirroring
// src/lib/regex/builderState.svelte.ts's module-singleton pattern. Each
// category's data is fetched lazily the first time that category is opened
// (ItemMods.min.json alone is ~3MB, so nothing is loaded eagerly).

import { persistGet, persistSet } from '$lib/persist';
import { defaultSettings, type Settings } from './settings';
import type { Category } from './types';
import {
  loadGems,
  loadItemMods,
  loadItemBases,
  loadJewel,
  loadMapMods,
  loadMapNames,
  loadExpedition,
  loadHeist,
  loadFlaskMods,
  loadBeasts,
  loadTattoos,
  loadRunegrafts,
  loadScarabs,
} from './loaders';
import type {
  GemToken,
  ItemModsData,
  BaseType,
  JewelData,
  MapModsData,
  MapNamesData,
  ExpeditionData,
  HeistData,
  FlaskModsData,
  BeastEntry,
  NamedRegexEntry,
  ScarabsData,
} from './types';

import { generateVendorRegex } from './generators/vendor';
import { generateItemsRegex, buildAffixMap } from './generators/items';
import { generateJewelRegex } from './generators/jewel';
import { generateMapModRegex } from './generators/mapmods';
import { generateMapNameRegex } from './generators/mapnames';
import { generateExpeditionRegex } from './generators/expedition';
import { generateHeistRegex } from './generators/heist';
import { generateFlaskRegex } from './generators/flasks';
import { generateBeastRegex } from './generators/beast';
import { generateTattooRegex } from './generators/tattoo';
import { generateRunegraftRegex } from './generators/runegraft';
import { generateScarabRegex } from './generators/scarab';

export interface Favorite {
  id: number;
  name: string;
  category: Category;
  regex: string;
}

const FAVORITES_KEY = 'POE1_REGEX_FAVORITES_V1';

// ── State ──────────────────────────────────────────────────────────────────
let _category = $state<Category>('vendor');
let _settings = $state<Settings>(defaultSettings());
let _favorites = $state<Favorite[]>([]);
let _favoritesLoaded = $state(false);

let _gemTokens = $state<GemToken[] | null>(null);
let _itemMods = $state<ItemModsData | null>(null);
let _itemBases = $state<BaseType[] | null>(null);
let _jewelData = $state<JewelData | null>(null);
let _mapModsData = $state<MapModsData | null>(null);
let _mapNamesData = $state<MapNamesData | null>(null);
let _expeditionData = $state<ExpeditionData | null>(null);
let _heistData = $state<HeistData | null>(null);
let _flaskModsData = $state<FlaskModsData | null>(null);
let _beasts = $state<BeastEntry[] | null>(null);
let _tattoos = $state<NamedRegexEntry[] | null>(null);
let _runegrafts = $state<NamedRegexEntry[] | null>(null);
let _scarabs = $state<ScarabsData | null>(null);

const _affixMap = $derived.by(() => (_itemMods ? buildAffixMap(_itemMods) : null));

async function ensureLoaded(category: Category): Promise<void> {
  switch (category) {
    case 'vendor':
      if (!_gemTokens) _gemTokens = await loadGems();
      break;
    case 'items':
      if (!_itemMods) _itemMods = await loadItemMods();
      if (!_itemBases) _itemBases = await loadItemBases();
      break;
    case 'jewel':
      if (!_jewelData) _jewelData = await loadJewel();
      break;
    case 'mapMods':
      if (!_mapModsData) _mapModsData = await loadMapMods();
      break;
    case 'mapNames':
      if (!_mapNamesData) _mapNamesData = await loadMapNames();
      break;
    case 'expedition':
      if (!_expeditionData) _expeditionData = await loadExpedition();
      break;
    case 'heist':
      if (!_heistData) _heistData = await loadHeist();
      break;
    case 'flasks':
      if (!_flaskModsData) _flaskModsData = await loadFlaskMods();
      break;
    case 'beast':
      if (!_beasts) _beasts = await loadBeasts();
      break;
    case 'tattoo':
      if (!_tattoos) _tattoos = await loadTattoos();
      break;
    case 'runegraft':
      if (!_runegrafts) _runegrafts = await loadRunegrafts();
      if (!_tattoos) _tattoos = await loadTattoos(); // shared by the "include tattoos" merge
      break;
    case 'scarab':
      if (!_scarabs) _scarabs = await loadScarabs();
      break;
  }
}

const _result = $derived.by(() => {
  switch (_category) {
    case 'vendor':
      return _gemTokens ? generateVendorRegex(_settings.vendor, _gemTokens) : '';
    case 'items':
      return _affixMap ? generateItemsRegex(_affixMap, _settings.items) : '';
    case 'jewel':
      return _jewelData ? generateJewelRegex(_settings.jewel, _jewelData.jewelRegular, _jewelData.jewelAbyss) : '';
    case 'mapMods':
      return _mapModsData ? generateMapModRegex(_settings.mapMods, _mapModsData) : '';
    case 'mapNames':
      return _mapNamesData ? generateMapNameRegex(_mapNamesData, _settings.mapNames) : '';
    case 'expedition':
      return _expeditionData ? generateExpeditionRegex(_expeditionData, _settings.expedition) : '';
    case 'heist':
      return _heistData ? generateHeistRegex(_heistData, _settings.heist) : '';
    case 'flasks':
      return _flaskModsData ? generateFlaskRegex(_flaskModsData, _settings.flasks) : '';
    case 'beast':
      return _beasts ? generateBeastRegex(_beasts, _settings.beast) : '';
    case 'tattoo':
      return _tattoos ? generateTattooRegex(_tattoos, _settings.tattoo) : '';
    case 'runegraft':
      return _runegrafts ? generateRunegraftRegex(_runegrafts, _tattoos ?? [], _settings.runegraft) : '';
    case 'scarab':
      return _scarabs ? generateScarabRegex(_scarabs, _settings.scarab) : '';
    default:
      return '';
  }
});

// ── Public API ───────────────────────────────────────────────────────────────
export const builder1 = {
  get category() {
    return _category;
  },
  set category(c: Category) {
    _category = c;
    void ensureLoaded(c);
  },
  get settings() {
    return _settings;
  },
  get result() {
    return _result;
  },
  get favorites() {
    return _favorites;
  },
  get favoritesLoaded() {
    return _favoritesLoaded;
  },
  // Loaded data, read-only from the UI's perspective (null until fetched).
  get gemTokens() {
    return _gemTokens;
  },
  get itemMods() {
    return _itemMods;
  },
  get itemBases() {
    return _itemBases;
  },
  get affixMap() {
    return _affixMap;
  },
  get jewelData() {
    return _jewelData;
  },
  get mapModsData() {
    return _mapModsData;
  },
  get mapNamesData() {
    return _mapNamesData;
  },
  get expeditionData() {
    return _expeditionData;
  },
  get heistData() {
    return _heistData;
  },
  get flaskModsData() {
    return _flaskModsData;
  },
  get beasts() {
    return _beasts;
  },
  get tattoos() {
    return _tattoos;
  },
  get runegrafts() {
    return _runegrafts;
  },
  get scarabs() {
    return _scarabs;
  },
};

// ── Lifecycle ────────────────────────────────────────────────────────────────
let initialized = false;
export async function initBuilder1(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const [favRaw] = await Promise.all([persistGet(FAVORITES_KEY), ensureLoaded(_category)]);
  if (favRaw) {
    try {
      _favorites = JSON.parse(favRaw) as Favorite[];
    } catch {
      _favorites = [];
    }
  }
  _favoritesLoaded = true;
}

// ── Generic array-selection helpers (used for the many "pick N named things"
// categories: gems, jewel mods, map names, expedition bases, beasts, tattoos,
// runegrafts, scarabs). ─────────────────────────────────────────────────────
export function toggleInArray<T>(arr: T[], value: T): T[] {
  const idx = arr.indexOf(value);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(value);
  }
  return arr;
}

// ── Actions ──────────────────────────────────────────────────────────────────
export function resetCategory(category: Category): void {
  const fresh = defaultSettings();
  _settings[category] = fresh[category] as never;
}

export function resetAll1(): void {
  _settings = defaultSettings();
}

async function persistFavorites(): Promise<void> {
  await persistSet(FAVORITES_KEY, JSON.stringify(_favorites));
}

export async function saveFavorite1(name: string): Promise<void> {
  const regex = _result.trim();
  if (!regex) return;
  _favorites = [..._favorites, { id: Date.now(), name: name.trim() || 'Untitled', category: _category, regex }];
  await persistFavorites();
}

export async function deleteFavorite1(id: number): Promise<void> {
  _favorites = _favorites.filter((f) => f.id !== id);
  await persistFavorites();
}
