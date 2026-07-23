// Ported verbatim from poe-vendor-string's src/utils/FlaskOuput.ts.
import type { FlaskModGroup, FlaskModsData } from '../types';
import type { FlaskSettings } from '../settings';

function findIlevel(modGroup: FlaskModGroup, ilevelNumber: number): number | undefined {
  const possible = modGroup.mods.filter((m) => m.level <= ilevelNumber);
  if (possible.length > 0) return possible.reduce((a, b) => (a.level > b.level ? a : b)).level;
  return undefined;
}

function findRegex(modGroup: FlaskModGroup, ilevelNumber: number, onlyMaxTierMod: boolean): string | undefined {
  const possible = modGroup.mods.filter((m) => m.level <= ilevelNumber);
  if (onlyMaxTierMod && possible.length > 0) {
    return possible.reduce((a, b) => (a.level > b.level ? a : b)).regex;
  }
  if (!onlyMaxTierMod && modGroup.minLevel <= ilevelNumber) return modGroup.regex;
  return undefined;
}

function replaceEffectTier(regex: string, modGroups: FlaskModGroup[], ignoreEffectTiers: boolean): string {
  if (!ignoreEffectTiers) return regex;
  const effectMod = modGroups.find((f) => f.description.includes('reduced Duration'));
  if (!effectMod) return regex;
  const tieredEffectRegexes = effectMod.mods.map((e) => e.regex);
  const tierReplaceRegex = new RegExp(tieredEffectRegexes.join('|'));
  return regex.replace(tierReplaceRegex, effectMod.regex);
}

export function minFlaskItemLevel(data: FlaskModsData, settings: FlaskSettings): string | undefined {
  const { selectedPrefix, selectedSuffix, itemLevel, onlyMaxPrefixTierMod, onlyMaxSuffixTierMod } = settings;
  if (!onlyMaxSuffixTierMod && !onlyMaxPrefixTierMod) return undefined;

  const prefixIlevels = selectedPrefix
    .map((desc) => {
      const mod = data.flaskPrefix.find((g) => g.description === desc);
      return mod ? findIlevel(mod, itemLevel) : undefined;
    })
    .filter((i): i is number => i !== undefined && onlyMaxPrefixTierMod);

  const suffixIlevels = selectedSuffix
    .map((desc) => {
      const mod = data.flaskSuffix.find((g) => g.description === desc);
      return mod ? findIlevel(mod, itemLevel) : undefined;
    })
    .filter((i): i is number => i !== undefined && onlyMaxSuffixTierMod);

  if (prefixIlevels.length === 0 && !onlyMaxSuffixTierMod) return undefined;
  if (suffixIlevels.length === 0 && !onlyMaxPrefixTierMod) return undefined;

  const itemLevels = prefixIlevels.concat(suffixIlevels);
  if (itemLevels.length === 0) return undefined;
  return `minimum flask item level: ${Math.max(...itemLevels)}`;
}

export function generateFlaskRegex(data: FlaskModsData, settings: FlaskSettings): string {
  const { selectedPrefix, selectedSuffix, itemLevel, onlyMaxPrefixTierMod, onlyMaxSuffixTierMod, matchBothPrefixAndSuffix, ignoreEffectTiers, matchOpenPrefixSuffix } = settings;

  const openPrefix = '^[a-z]+ F';
  const openSuffix = 'ask$';

  const prefixRegex = selectedPrefix
    .map((desc) => {
      const mod = data.flaskPrefix.find((g) => g.description === desc);
      return mod ? findRegex(mod, itemLevel, onlyMaxPrefixTierMod) : undefined;
    })
    .filter((v): v is string => v !== undefined)
    .join('|');

  const suffixRegex = selectedSuffix
    .map((desc) => {
      const mod = data.flaskSuffix.find((g) => g.description === desc);
      return mod ? findRegex(mod, itemLevel, onlyMaxSuffixTierMod) : undefined;
    })
    .filter((v): v is string => v !== undefined)
    .join('|');

  const filteredPrefixRegex = replaceEffectTier(prefixRegex, data.flaskPrefix, ignoreEffectTiers);

  if (filteredPrefixRegex.length > 0 && suffixRegex.length > 0) {
    if (matchBothPrefixAndSuffix) {
      if (matchOpenPrefixSuffix) return `"${openPrefix}|${filteredPrefixRegex}" "${openSuffix}|${suffixRegex}"`;
      return `"${filteredPrefixRegex}" "${suffixRegex}"`;
    }
    return `"${filteredPrefixRegex}|${suffixRegex}"`;
  }
  if (filteredPrefixRegex.length > 0) return `"${filteredPrefixRegex}"`;
  if (suffixRegex.length > 0) return `"${suffixRegex}"`;
  return '';
}
