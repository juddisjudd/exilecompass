// Per-category settings shapes + defaults for the PoE1 Regex tab. Unlike the
// PoE2 builder (src/lib/regex/settings.ts), most PoE1 categories don't share
// one AND/OR group model — poe.re's Vendor/Expedition/Heist/named-list tools
// are flat ORs, while Items/Jewel/Flasks/Map-mods have their own bespoke
// prefix/suffix + numeric-threshold shapes. Each category's settings mirror
// its own generator's needs directly rather than forcing a common shape.

import type { Category } from './types';

export interface VendorSettings {
  anyTwoLink: boolean;
  anyThreeLink: boolean;
  anyFourLink: boolean;
  anyFiveLink: boolean;
  anySixLink: boolean;
  anyTwoColorLink: boolean;
  anyThreeColorLink: boolean;
  anyFourColorLink: boolean;
  anyFiveColorLink: boolean;
  anySixColorLink: boolean;
  anySixSocket: boolean;
  movement: { ten: boolean; fifteen: boolean };
  colors: {
    rrr: boolean; ggg: boolean; bbb: boolean;
    rrA: boolean; ggA: boolean; bbA: boolean;
    ggr: boolean; ggb: boolean; rrg: boolean; rrb: boolean; bbg: boolean; bbr: boolean;
    rgb: boolean;
    raa: boolean; gaa: boolean; baa: boolean;
    rr: boolean; gg: boolean; bb: boolean;
    rb: boolean; gr: boolean; bg: boolean;
    specLink: boolean;
    specLinkColors: { r: number | undefined; g: number | undefined; b: number | undefined };
  };
  plusGems: { lightning: boolean; fire: boolean; cold: boolean; phys: boolean; chaos: boolean; any: boolean };
  damage: { phys: boolean; firemult: boolean; coldmult: boolean; chaosmult: boolean };
  weapon: {
    sceptre: boolean; mace: boolean; axe: boolean; sword: boolean; bow: boolean;
    claw: boolean; dagger: boolean; staff: boolean; wand: boolean; shield: boolean;
  };
  gems: number[];
}

export const defaultVendorSettings = (): VendorSettings => ({
  anyTwoLink: false, anyThreeLink: false, anyFourLink: false, anyFiveLink: false, anySixLink: false,
  anyTwoColorLink: false, anyThreeColorLink: false, anyFourColorLink: false, anyFiveColorLink: false, anySixColorLink: false,
  anySixSocket: false,
  movement: { ten: false, fifteen: false },
  colors: {
    rrr: false, ggg: false, bbb: false,
    rrA: false, ggA: false, bbA: false,
    ggr: false, ggb: false, rrg: false, rrb: false, bbg: false, bbr: false,
    rgb: false,
    raa: false, gaa: false, baa: false,
    rr: false, gg: false, bb: false,
    rb: false, gr: false, bg: false,
    specLink: false,
    specLinkColors: { r: undefined, g: undefined, b: undefined },
  },
  plusGems: { lightning: false, fire: false, cold: false, phys: false, chaos: false, any: false },
  damage: { phys: false, firemult: false, coldmult: false, chaosmult: false },
  weapon: { sceptre: false, mace: false, axe: false, sword: false, bow: false, claw: false, dagger: false, staff: false, wand: false, shield: false },
  gems: [],
});

// ── Items ────────────────────────────────────────────────────────────────────
export type ItemsMatchMode = 'all' | 'any' | 'prefixAndSuffix';
export type MagicMatchMode = 'any' | 'prefixAndSuffix' | 'openAffix';

// Rare and Magic selections are kept independent (matching upstream) so
// switching the rarity toggle for the same base type doesn't discard either.
// Map keys are the composite `${baseType}-${category}-${desc}` used to look
// mods up in the flattened affix map (see generators/items.ts buildAffixMap).
export interface ItemsSettings {
  baseType: string; // key into ItemMods data ('' = none chosen)
  item: string; // concrete base item name (magic-mode anchor)
  rarity: 'rare' | 'magic';
  itemLevel: number;
  selectedRareMods: Record<string, boolean>;
  rareModValues: Record<string, Record<number, string>>;
  selectedMagicMods: Record<string, boolean>;
  rareMatchMode: ItemsMatchMode;
  magicMatchMode: MagicMatchMode;
}

export const defaultItemsSettings = (): ItemsSettings => ({
  baseType: '',
  item: '',
  rarity: 'rare',
  itemLevel: 84,
  selectedRareMods: {},
  rareModValues: {},
  selectedMagicMods: {},
  rareMatchMode: 'all',
  magicMatchMode: 'any',
});

// ── Jewel ────────────────────────────────────────────────────────────────────
export interface JewelSettings {
  abyssJewel: boolean;
  magicOnly: boolean;
  allMatch: boolean;
  matchBothPrefixAndSuffix: boolean;
  matchOpenPrefixSuffix: boolean;
  selectedRegular: string[]; // mod label strings (JewelRegex.mod)
  selectedAbyss: string[];
}

export const defaultJewelSettings = (): JewelSettings => ({
  abyssJewel: false,
  magicOnly: false,
  allMatch: false,
  matchBothPrefixAndSuffix: true,
  matchOpenPrefixSuffix: true,
  selectedRegular: [],
  selectedAbyss: [],
});

// ── Map mods ─────────────────────────────────────────────────────────────────
export interface MapModsSettings {
  goodIds: number[];
  badIds: number[];
  allGoodMods: boolean; // true = AND ("all"), false = OR ("any")
  displayNightmareMods: boolean;
  quantity: string;
  packsize: string;
  mapDropChance: string;
  itemRarity: string;
  optimizeQuant: boolean; // shared by quantity, mapDropChance, itemRarity
  optimizePacksize: boolean;
  filterCorrupted: boolean;
  corruptedInclude: boolean; // true = require corrupted, false = exclude
  filterUnidentified: boolean;
  unidentifiedInclude: boolean;
  filterRarity: { normal: boolean; magic: boolean; rare: boolean };
  rarityInclude: boolean;
  quality: { regular: string; currency: string; divination: string; rarity: string; packSize: string; scarab: string };
  optimizeQuality: boolean;
  anyQuality: boolean;
  customText: string;
}

export const defaultMapModsSettings = (): MapModsSettings => ({
  goodIds: [],
  badIds: [],
  allGoodMods: true,
  displayNightmareMods: true,
  quantity: '',
  packsize: '',
  mapDropChance: '',
  itemRarity: '',
  optimizeQuant: true,
  optimizePacksize: true,
  filterCorrupted: false,
  corruptedInclude: true,
  filterUnidentified: false,
  unidentifiedInclude: true,
  filterRarity: { normal: false, magic: false, rare: false },
  rarityInclude: true,
  quality: { regular: '', currency: '', divination: '', rarity: '', packSize: '', scarab: '' },
  optimizeQuality: true,
  anyQuality: false,
  customText: '',
});

// ── Map names ────────────────────────────────────────────────────────────────
export interface MapNamesSettings {
  selected: string[]; // map name keys
  mapTabSearch: boolean;
}
export const defaultMapNamesSettings = (): MapNamesSettings => ({ selected: [], mapTabSearch: false });

// ── Expedition ───────────────────────────────────────────────────────────────
export interface ExpeditionSettings {
  selectedBaseTypes: string[];
}
export const defaultExpeditionSettings = (): ExpeditionSettings => ({ selectedBaseTypes: [] });

// ── Heist ────────────────────────────────────────────────────────────────────
export interface HeistContractLevel {
  start: number;
  end: number;
}
export interface HeistSettings {
  contractLevels: Record<string, HeistContractLevel>; // key = contract type name
  targetValue: number;
  requireCoinValue: boolean;
}
export const defaultHeistSettings = (): HeistSettings => ({
  contractLevels: {},
  targetValue: 0,
  requireCoinValue: false,
});

// ── Flasks ───────────────────────────────────────────────────────────────────
export interface FlaskSettings {
  itemLevel: number;
  selectedPrefix: string[]; // group description keys
  selectedSuffix: string[];
  matchBothPrefixAndSuffix: boolean;
  matchOpenPrefixSuffix: boolean;
  ignoreEffectTiers: boolean;
  onlyMaxPrefixTierMod: boolean;
  onlyMaxSuffixTierMod: boolean;
}
export const defaultFlaskSettings = (): FlaskSettings => ({
  itemLevel: 85,
  selectedPrefix: [],
  selectedSuffix: [],
  matchBothPrefixAndSuffix: true,
  matchOpenPrefixSuffix: true,
  ignoreEffectTiers: false,
  onlyMaxPrefixTierMod: false,
  onlyMaxSuffixTierMod: false,
});

// ── Beast / Tattoo / Runegraft / Scarab (flat named-list picks) ─────────────
export interface BeastSettings {
  selected: string[]; // beast names
  includeHarvest: boolean;
  redBeastsOnly: boolean;
}
export const defaultBeastSettings = (): BeastSettings => ({ selected: [], includeHarvest: true, redBeastsOnly: false });

export interface TattooSettings {
  selected: string[]; // tattoo names
}
export const defaultTattooSettings = (): TattooSettings => ({ selected: [] });

export interface RunegraftSettings {
  selected: string[]; // runegraft names
  includeTattoos: boolean;
  selectedTattoos: string[];
}
export const defaultRunegraftSettings = (): RunegraftSettings => ({ selected: [], includeTattoos: false, selectedTattoos: [] });

export interface ScarabSettings {
  selected: string[]; // scarab names
}
export const defaultScarabSettings = (): ScarabSettings => ({ selected: [] });

// ── Aggregate ────────────────────────────────────────────────────────────────
export interface Settings {
  vendor: VendorSettings;
  items: ItemsSettings;
  jewel: JewelSettings;
  mapMods: MapModsSettings;
  mapNames: MapNamesSettings;
  expedition: ExpeditionSettings;
  heist: HeistSettings;
  flasks: FlaskSettings;
  beast: BeastSettings;
  tattoo: TattooSettings;
  runegraft: RunegraftSettings;
  scarab: ScarabSettings;
}

export function defaultSettings(): Settings {
  return {
    vendor: defaultVendorSettings(),
    items: defaultItemsSettings(),
    jewel: defaultJewelSettings(),
    mapMods: defaultMapModsSettings(),
    mapNames: defaultMapNamesSettings(),
    expedition: defaultExpeditionSettings(),
    heist: defaultHeistSettings(),
    flasks: defaultFlaskSettings(),
    beast: defaultBeastSettings(),
    tattoo: defaultTattooSettings(),
    runegraft: defaultRunegraftSettings(),
    scarab: defaultScarabSettings(),
  };
}

export const CATEGORY_ORDER: Category[] = [
  'vendor', 'items', 'mapMods', 'mapNames', 'expedition', 'heist',
  'flasks', 'beast', 'tattoo', 'runegraft', 'scarab', 'jewel',
];
