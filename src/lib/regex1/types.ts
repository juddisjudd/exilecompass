// Shared data shapes for the PoE1 Regex tab. Ported from poe-vendor-string
// (poe.re) — see tools/poe1-regex-source/ for the vendored originals and
// tools/build-poe1-regex-data.mjs for how they're converted to the JSON this
// module's loaders fetch at runtime (static/generated/poe1/*.min.json).

export type Category =
  | 'vendor'
  | 'items'
  | 'jewel'
  | 'mapMods'
  | 'mapNames'
  | 'expedition'
  | 'heist'
  | 'flasks'
  | 'beast'
  | 'tattoo'
  | 'runegraft'
  | 'scarab';

// ── Vendor / Gems ────────────────────────────────────────────────────────────
export interface GemTokenOptions {
  c: 'r' | 'g' | 'b' | 'w';
  support: boolean;
}
export interface GemToken {
  id: number;
  regex: string;
  rawText: string;
  generalizedText: string;
  options: GemTokenOptions;
}

// ── Items ────────────────────────────────────────────────────────────────────
export interface AffixStat {
  id: string;
  min: number;
  max: number;
  numberIndex: number | undefined;
  hasRange: boolean;
}
export interface Affix {
  name: string;
  desc: string;
}
export interface ItemAffixRegex {
  desc: string;
  regex: string;
  disabled: number[];
  before: number[];
  on: number[];
  after: number[];
  affixtype: 'PREFIX' | 'SUFFIX';
  stats: AffixStat[];
  affixes: Affix[];
}
export interface CategoryRegex {
  category: string;
  warnings: string[];
  modifiers: ItemAffixRegex[];
}
export interface ItemRegex {
  basetype: string;
  categoryRegex: CategoryRegex[];
}
export type ItemModsData = Record<string, ItemRegex>;

export interface BaseType {
  name: string;
  items: string[];
}

// ── Jewel ────────────────────────────────────────────────────────────────────
export interface JewelRegex {
  mod: string;
  regex: string;
  regexAffix: string;
  isPrefix: boolean;
}
export interface JewelData {
  jewelRegular: JewelRegex[];
  jewelAbyss: JewelRegex[];
}

// ── Map mods ─────────────────────────────────────────────────────────────────
export interface MapModTokenOptions {
  scary: number;
  nm: boolean;
  prefix: boolean;
  rewards?: string[];
}
export interface MapModToken {
  id: number;
  regex: string;
  rawText: string;
  generalizedText: string;
  options: MapModTokenOptions;
}
export interface TokenOptimization {
  ids: number[];
  regex: string;
  weight: number;
  count: number;
}
export interface MapModsData {
  tokens: MapModToken[];
  optimizationTable: Record<string, TokenOptimization>;
}

// ── Map names ────────────────────────────────────────────────────────────────
export interface MapNameEntry {
  name: string;
  isUnique: boolean;
  matchSafe: string;
}
export type MapNamesData = Record<string, MapNameEntry>;

// ── Expedition ───────────────────────────────────────────────────────────────
export interface ExpeditionItem {
  id: string;
  name: string;
  baseType: string;
  icon: string;
}
export interface ExpeditionBaseType {
  baseType: string;
  regex: string;
  items: ExpeditionItem[];
}
export type ExpeditionData = Record<string, ExpeditionBaseType>;

// ── Heist ────────────────────────────────────────────────────────────────────
export interface HeistContractType {
  name: string;
  matchSafe: string;
}
export interface HeistTargetValue {
  name: string;
  coinValue: number;
  matchSafe: string;
}
export interface HeistData {
  heistContractTypes: Record<string, HeistContractType>;
  heistTargetValues: Record<string, HeistTargetValue>;
}

// ── Flasks ───────────────────────────────────────────────────────────────────
export interface FlaskModTier {
  level: number;
  name: string;
  value: string;
  regex: string;
}
export interface FlaskModGroup {
  minLevel: number;
  description: string;
  regex: string;
  tag: { name: string; sort: number; color: string };
  mods: FlaskModTier[];
}
export interface FlaskModsData {
  flaskPrefix: FlaskModGroup[];
  flaskSuffix: FlaskModGroup[];
}

// ── Beast ────────────────────────────────────────────────────────────────────
export interface BeastEntry {
  beast: string;
  recipe: string;
  regex: string;
  harvest: boolean;
  red: boolean;
}

// ── Tattoo / Runegraft (identical shape) ────────────────────────────────────
export interface NamedRegexEntry {
  description: string;
  regex: string;
  [nameField: string]: string;
}

// ── Scarab ───────────────────────────────────────────────────────────────────
export interface ScarabEntry {
  name: string;
  regex: string;
  icon: string;
  description: string;
  flavourText: string;
}
export type ScarabsData = Record<string, ScarabEntry>;
