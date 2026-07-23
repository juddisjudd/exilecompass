// Ported from poe-vendor-string's src/pages/maps/OptimizedMapOutput.ts +
// src/utils/regex/OptimizeRegexResult.ts. Only the ENGLISH MapStaticStatRegex
// fragments are ported (see PoE1 regex research notes — every other language
// there is either an untranslated copy of English or, for the map-mod tokens
// themselves, not bundled by this app at all).
import { generateNumberRegex } from '$lib/regex/numberRegex';
import type { MapModsData } from '../types';
import type { MapModsSettings } from '../settings';

const STATIC = {
  quantity: 'm q.*',
  packsize: 'iz.*',
  mapdrop: 're maps.*',
  itemrarity: 'm rar.*',
  quality_regular: 'ty \\(Quantity\\):.*',
  quality_currency: 'urr.*',
  quality_divination: 'div.*',
  quality_rarity: 'ty\\).*',
  quality_packsize: 'ze\\).*',
  quality_scarab: 'sca.*',
  rarity_prefix: 'y: ',
  rarity_normal: 'n',
  rarity_magic: 'm',
  rarity_rare: 'r',
  corrupted: 'pte',
  unidentified: 'tified',
};

function distinct<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function idToRegex(id: number, data: MapModsData): string | undefined {
  return data.tokens.find((t) => t.id === id)?.regex;
}

function optimizationSize(numberOfElements: number): number {
  if (numberOfElements < 15) return 8;
  if (numberOfElements < 18) return 7;
  if (numberOfElements < 21) return 6;
  if (numberOfElements < 28) return 5;
  return 4;
}

function generateOptimizationKeys(arr: number[], maxLength: number): string[] {
  const result: string[] = [];
  const minLength = 2;
  function combine(start: number, combination: number[]) {
    if (combination.length >= minLength && combination.length <= maxLength) {
      result.push(combination.join(':'));
    }
    for (let i = start; i < arr.length; i++) {
      if (combination.length < maxLength) combine(i + 1, [...combination, arr[i]]);
    }
  }
  combine(0, []);
  return result.sort((a, b) => b.length - a.length);
}

function optimizedRegexTokens(selectedIds: number[], data: MapModsData): string[] {
  const maxLength = optimizationSize(selectedIds.length);
  const optimizationKeys = generateOptimizationKeys(selectedIds, maxLength);

  let optimizedRegex: string[] = [];
  const unoptimizedIds = optimizationKeys.reduce((ids, key) => {
    const entry = data.optimizationTable[key];
    if (entry === undefined || !entry.ids.every((id) => ids.includes(id))) return ids;
    optimizedRegex = optimizedRegex.concat(entry.regex);
    return ids.filter((id) => !entry.ids.some((toRemove) => toRemove === id));
  }, selectedIds);

  const unoptimizedTokens = unoptimizedIds
    .map((tokenId) => data.tokens.find((t) => t.id === tokenId))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  return distinct(optimizedRegex.concat(unoptimizedTokens.map((t) => t.regex)));
}

function optimizeRegexFromIds(selectedIds: number[], data: MapModsData): string[] {
  const regexTokenIds = data.tokens.map((t) => t.id);
  const existing = selectedIds.filter((id) => regexTokenIds.includes(id));
  return optimizedRegexTokens(existing, data);
}

function isNightmareId(id: number, data: MapModsData): boolean {
  return data.tokens.find((t) => t.id === id)?.options.nm === true;
}

function getSelectedIds(settings: MapModsSettings, ids: number[], data: MapModsData): number[] {
  return settings.displayNightmareMods ? ids : ids.filter((id) => !isNightmareId(id, data));
}

function generateBadMods(settings: MapModsSettings, data: MapModsData): string {
  if (settings.badIds.length === 0) return '';
  const tokens = optimizeRegexFromIds(getSelectedIds(settings, settings.badIds, data), data);
  return `"!${tokens.join('|')}"`;
}

function onlyUnique(value: string, index: number, array: string[]): boolean {
  return array.indexOf(value) === index;
}

function generateGoodMods(settings: MapModsSettings, data: MapModsData): string {
  if (settings.goodIds.length === 0) return '';
  const tokens = getSelectedIds(settings, settings.goodIds, data)
    .map((id) => idToRegex(id, data))
    .filter((e): e is string => e !== undefined)
    .filter(onlyUnique);

  if (settings.allGoodMods) {
    return tokens.map((token) => (token.includes(' ') ? `"${token}"` : token)).join(' ');
  }
  return `"${tokens.join('|')}"`;
}

function addQuantifier(prefix: string, value: string): string {
  if (value === '') return '';
  return `"${prefix}${value}%"`;
}

function qualityQualifier(settings: MapModsSettings): string {
  const q = settings.quality;
  const result = [
    addQuantifier(STATIC.quality_regular, generateNumberRegex(q.regular, settings.optimizeQuality)),
    addQuantifier(STATIC.quality_currency, generateNumberRegex(q.currency, settings.optimizeQuality)),
    addQuantifier(STATIC.quality_divination, generateNumberRegex(q.divination, settings.optimizeQuality)),
    addQuantifier(STATIC.quality_rarity, generateNumberRegex(q.rarity, settings.optimizeQuality)),
    addQuantifier(STATIC.quality_packsize, generateNumberRegex(q.packSize, settings.optimizeQuality)),
    addQuantifier(STATIC.quality_scarab, generateNumberRegex(q.scarab, settings.optimizeQuality)),
  ].filter((e) => e !== '');

  if (settings.anyQuality) {
    if (result.length === 0) return '';
    return `"${result.map((e) => e.slice(1, -1)).join('|')}"`;
  }
  return result.join(' ');
}

function addRarityRegex(settings: MapModsSettings): string {
  const { normal, magic, rare } = settings.filterRarity;
  const include = settings.rarityInclude;
  if (normal && magic && rare) {
    return include ? '' : `"!${STATIC.rarity_prefix}(${STATIC.rarity_normal}|${STATIC.rarity_magic}|${STATIC.rarity_rare})"`;
  }
  const result = [normal ? STATIC.rarity_normal : '', magic ? STATIC.rarity_magic : '', rare ? STATIC.rarity_rare : '']
    .filter((e) => e.length > 0)
    .join('|');

  const excludePrefix = include ? '' : '!';
  if (result.length === 0) return '';
  if (result.length === 1) return `"${excludePrefix}${STATIC.rarity_prefix}${result}"`;
  return `"${excludePrefix}${STATIC.rarity_prefix}(${result})"`;
}

function corruptedMapCheck(settings: MapModsSettings): string {
  if (!settings.filterCorrupted) return '';
  return settings.corruptedInclude ? STATIC.corrupted : `!${STATIC.corrupted}`;
}

function unidentifiedMap(settings: MapModsSettings): string {
  if (!settings.filterUnidentified) return '';
  return settings.unidentifiedInclude ? STATIC.unidentified : `!${STATIC.unidentified}`;
}

function optimize(str: string): string {
  return str.replaceAll('"!"', '').replaceAll('[8-9]', '[89]').replaceAll('[9-9]', '9');
}

export function generateMapModRegex(settings: MapModsSettings, data: MapModsData): string {
  const exclusions = generateBadMods(settings, data);
  const inclusions = generateGoodMods(settings, data);
  const quantity = addQuantifier(STATIC.quantity, generateNumberRegex(settings.quantity, settings.optimizeQuant));
  const packsize = addQuantifier(STATIC.packsize, generateNumberRegex(settings.packsize, settings.optimizePacksize));
  const mapDrop = addQuantifier(STATIC.mapdrop, generateNumberRegex(settings.mapDropChance, settings.optimizeQuant));
  const itemRarity = addQuantifier(STATIC.itemrarity, generateNumberRegex(settings.itemRarity, settings.optimizeQuant));
  const quality = qualityQualifier(settings);
  const rarity = addRarityRegex(settings);
  const corrupted = corruptedMapCheck(settings);
  const unidentified = unidentifiedMap(settings);

  const result = `${exclusions} ${inclusions} ${quantity} ${packsize} ${itemRarity} ${quality} ${rarity} ${mapDrop} ${corrupted} ${unidentified}`
    .trim()
    .replaceAll(/\s{2,}/g, ' ');

  return optimize(result);
}
