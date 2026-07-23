// Ported from poe-vendor-string's src/pages/item/ItemOuput.ts (the live
// `/items` tool — the legacy `/items-old` MagicItem.tsx path is not ported,
// see the PoE1 regex research notes). Mods are looked up by the composite key
// `${baseType}-${category}-${desc}` (upstream's `affixMap`), scoped to the
// currently selected base type.
import { generateNumberRegex } from '$lib/regex/numberRegex';
import type { ItemAffixRegex, ItemModsData } from '../types';
import type { ItemsSettings } from '../settings';

export interface AffixMapEntry extends ItemAffixRegex {
  key: string;
  baseType: string;
  category: string;
}

export function buildAffixMap(data: ItemModsData): Record<string, AffixMapEntry> {
  const map: Record<string, AffixMapEntry> = {};
  for (const [baseType, item] of Object.entries(data)) {
    for (const cat of item.categoryRegex) {
      for (const mod of cat.modifiers) {
        const key = `${baseType}-${cat.category}-${mod.desc}`;
        map[key] = { ...mod, key, baseType, category: cat.category };
      }
    }
  }
  return map;
}

const digitRegex = /\d+/;

function numberFragment(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  return generateNumberRegex(value, false).replaceAll('.', '\\d');
}

export function generateRareItemRegex(affixMap: Record<string, AffixMapEntry>, settings: ItemsSettings): string {
  if (!settings.baseType) return '';

  const result = Object.entries(settings.selectedRareMods)
    .filter(([, selected]) => selected)
    .map(([key]) => ({ key, mod: affixMap[key], values: settings.rareModValues[key] ?? {} }))
    .filter((e): e is { key: string; mod: AffixMapEntry; values: Record<number, string> } => !!e.mod)
    .filter((e) => e.key.startsWith(settings.baseType))
    .map((e) => {
      const onIndex = e.mod.on[0];
      const onValue = onIndex !== undefined ? e.values[onIndex] : undefined;
      const onFragment = numberFragment(onValue);
      const regex = onFragment !== undefined ? e.mod.regex.replace(digitRegex, onFragment) : e.mod.regex;

      const numbersBefore = e.mod.before
        .map((i) => numberFragment(e.values[i]))
        .filter((f): f is string => f !== undefined)
        .join('.*');
      const numbersAfter = e.mod.after
        .map((i) => numberFragment(e.values[i]))
        .filter((f): f is string => f !== undefined)
        .join('.*');

      const str = [numbersBefore, regex, numbersAfter].filter((s) => s !== '').join('.*');
      return { str, affixtype: e.mod.affixtype };
    });

  if (settings.rareMatchMode === 'prefixAndSuffix') {
    const prefixes = result.filter((e) => e.affixtype === 'PREFIX').map((e) => e.str).join('|');
    const suffixes = result.filter((e) => e.affixtype === 'SUFFIX').map((e) => e.str).join('|');
    if (prefixes && suffixes) return `"${prefixes}" "${suffixes}"`;
    return result.map((e) => `"${e.str}"`).join(' ');
  }
  if (settings.rareMatchMode === 'any') {
    const regex = result.map((e) => e.str).join('|');
    return regex.length > 0 ? `"${regex}"` : '';
  }
  return result.map((e) => `"${e.str}"`).join(' ');
}

export function generateMagicItemRegex(affixMap: Record<string, AffixMapEntry>, settings: ItemsSettings): string {
  if (!settings.baseType || !settings.item) return '';

  const mods = Object.entries(settings.selectedMagicMods)
    .filter(([, selected]) => selected)
    .map(([key]) => affixMap[key])
    .filter((m): m is AffixMapEntry => !!m && m.key.startsWith(settings.baseType));

  const prefixes = mods.filter((m) => m.affixtype === 'PREFIX').map((m) => m.desc);
  const suffixes = mods.filter((m) => m.affixtype === 'SUFFIX').map((m) => m.desc);
  const item = settings.item;
  const openAffix = settings.magicMatchMode === 'openAffix';
  const bothRequired = settings.magicMatchMode === 'prefixAndSuffix';

  if (!openAffix && !bothRequired) {
    const prefixMatch = prefixes.map((e) => `^${e}`);
    const suffixMatch = suffixes.map((e) => `${e}$`);
    const s = prefixMatch.concat(suffixMatch).join('|');
    return s ? `"${s}"` : '';
  }
  if (!openAffix && bothRequired) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : '';
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : '';
    return `"${prefixMatch}\\s?${item}\\s?${suffixMatch}"`;
  }
  if (openAffix && bothRequired) {
    const prefixMatch = prefixes.length > 0 ? `(${prefixes.join('|')})` : '';
    const suffixMatch = suffixes.length > 0 ? `(${suffixes.join('|')})` : '';
    if (prefixMatch.length === 0 && suffixMatch.length === 0) return '';
    return `"^${prefixMatch}\\s${item}|^${item}" "${item}\\s${suffixMatch}|${item}$"`;
  }
  // openAffix && !bothRequired
  const prefixMatch = prefixes.map((e) => `^${e}`);
  const suffixMatch = suffixes.map((e) => `${e}$`);
  const s = prefixMatch.concat(suffixMatch).concat([`^${item}`, `${item}$`]).join('|');
  return s ? `"${s}"` : '';
}

export function generateItemsRegex(affixMap: Record<string, AffixMapEntry>, settings: ItemsSettings): string {
  return settings.rarity === 'magic'
    ? generateMagicItemRegex(affixMap, settings)
    : generateRareItemRegex(affixMap, settings);
}
