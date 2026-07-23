// Ported verbatim from poe-vendor-string's src/pages/jewel/JewelOutput.ts.
// Covers Regular + Abyss jewels only — Cluster Jewels are handled by the
// Items category (they're itemized as ordinary basetypes there).
import type { JewelRegex } from '../types';
import type { JewelSettings } from '../settings';

function generateMagicJewel(settings: JewelSettings, selectedMods: string[], lookup: Map<string, JewelRegex>): string {
  const openPrefix = settings.abyssJewel ? '^([a-z]+ ){2}J' : '^[a-z]+ J';
  const openSuffix = 'wel$';

  const mods = selectedMods.map((e) => lookup.get(e)).filter((e): e is JewelRegex => !!e);
  const prefixes = mods.filter((e) => e.isPrefix).map((e) => e.regexAffix).join('|');
  const suffixes = mods.filter((e) => !e.isPrefix).map((e) => e.regexAffix).join('|');

  if (prefixes.length > 0 && suffixes.length > 0) {
    if (settings.matchBothPrefixAndSuffix) {
      if (settings.matchOpenPrefixSuffix) {
        return `"${openPrefix}|${prefixes}" "${openSuffix}|${suffixes}"`;
      }
      return `"${prefixes}" "${suffixes}"`;
    }
    return `"${prefixes}|${suffixes}"`;
  }
  if (prefixes.length > 0) return `"${prefixes}"`;
  if (suffixes.length > 0) return `"${suffixes}"`;
  return '';
}

function generateJewel(settings: JewelSettings, selectedMods: string[], lookup: Map<string, JewelRegex>): string {
  const regex = selectedMods.map((mod) => lookup.get(mod)?.regex).filter((r): r is string => !!r);
  if (regex.length === 0) return '';
  return settings.allMatch ? regex.map((e) => `"${e}"`).join(' ') : `"${regex.join('|')}"`;
}

export function generateJewelRegex(settings: JewelSettings, jewelRegular: JewelRegex[], jewelAbyss: JewelRegex[]): string {
  const selectedMods = settings.abyssJewel ? settings.selectedAbyss : settings.selectedRegular;
  const pool = settings.abyssJewel ? jewelAbyss : jewelRegular;
  const lookup = new Map(pool.map((i) => [i.mod, i]));

  return settings.magicOnly
    ? generateMagicJewel(settings, selectedMods, lookup)
    : generateJewel(settings, selectedMods, lookup);
}
