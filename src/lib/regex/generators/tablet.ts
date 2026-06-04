// Tablet query. Rarity / type / uses-remaining are structural AND terms;
// affixes are grouped (OR within / AND across).
import { formatExcludes, groupsToTerms, type Settings } from '../settings';
import { selectedOptionRegex } from '../affix';

export function generateTabletRegex(settings: Settings): string {
  const t = settings.tablet;
  const round10 = t.modifier.round10;
  const result = [
    generateRarityRegex(t.rarity),
    generateTypeRegex(t.type),
    t.modifier.usesRemaining ? generateUsesRemainingRegex(t.modifier) : null,
    ...groupsToTerms(t.groups, (o) => selectedOptionRegex(o, round10)),
    t.resultSettings.customText || null,
    formatExcludes(t.resultSettings.excludeKeywords) || null,
  ].filter((e) => e !== null && e !== '');

  if (result.length === 0) return '';
  return result.join(' ').trim();
}

function generateRarityRegex(settings: Settings['tablet']['rarity']): string | null {
  if ((settings.normal && settings.magic) || (!settings.normal && !settings.magic)) {
    return null;
  }
  const normalRegex = settings.normal ? 'n' : '';
  const magicRegex = settings.magic ? 'm' : '';
  const result = [normalRegex, magicRegex].filter((e) => e.length > 0).join('|');
  if (result.length === 0) return null;
  return `"y: ${result}"`;
}

function generateTypeRegex(settings: Settings['tablet']['type']): string | null {
  const all =
    settings.breach &&
    settings.delirium &&
    settings.irradiated &&
    settings.expedition &&
    settings.ritual &&
    settings.overseer;
  const none =
    !settings.breach &&
    !settings.delirium &&
    !settings.irradiated &&
    !settings.expedition &&
    !settings.ritual &&
    !settings.overseer;
  if (all || none) return null;

  const result = [
    settings.breach ? 'eac' : '',
    settings.delirium ? 'liri' : '',
    settings.irradiated ? 'rra' : '',
    settings.expedition ? 'xped' : '',
    settings.ritual ? 'tual' : '',
    settings.overseer ? 'eer' : '',
  ]
    .filter((e) => e.length > 0)
    .join('|');

  if (result.length === 0) return null;
  if (result.includes('|')) return `"(${result})"`;
  return `"${result}"`;
}

function generateUsesRemainingRegex(settings: Settings['tablet']['modifier']): string | null {
  const n = settings.numUsesRemaining;
  if (n < 1 || n > 18) return null;
  const numberRegex = n < 10 ? `(${n === 9 ? '9' : `[${n}-9]`}|1[0-8])` : `(1[${n % 10}-8])`;
  return `"${numberRegex} us"`;
}
