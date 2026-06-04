// Waystone query. Tier / state / quantifiers are structural AND terms; wanted
// mods are grouped (OR within / AND across); unwanted mods are a negated term.
import { formatExcludes, groupsToTerms, type Settings } from '../settings';
import { generateNumberRegex } from '../numberRegex';
import { selectedOptionRegex } from '../affix';

export function generateWaystoneRegex(settings: Settings): string {
  const w = settings.waystone;
  const round10 = w.modifier.round10;
  const result = [
    generateTierRegex(w.tier),
    ...groupsToTerms(w.groups, (o) => selectedOptionRegex(o, round10)),
    generateUnwanted(w.modifier, round10),
    generateState(w.state),
    ...generateQuantifiers(w),
    w.resultSettings.customText || null,
    formatExcludes(w.resultSettings.excludeKeywords) || null,
  ].filter((e) => e !== null && e !== '');

  if (result.length === 0) return '';
  return result.join(' ').trim();
}

function generateTierRegex(settings: Settings['waystone']['tier']): string | null {
  if (settings.max === 0 && settings.min === 0) return null;
  if (settings.max !== 0 && settings.min > settings.max) return null;
  if (settings.min < 1 || settings.max < 1) return null;
  if (settings.min <= 1 && settings.max === 16) return null;

  const max = settings.max === 0 ? 16 : settings.max;
  const min = settings.min;

  const numbersUnder10 = range(min, Math.min(10, max + 1));
  const numbersOver10 = range(Math.max(10, min), max + 1);

  const regexUnder10 =
    numbersUnder10.length <= 1
      ? `${numbersUnder10.join('')}`
      : numbersUnder10.length > 2
        ? `[${numbersUnder10[0]}-${numbersUnder10[numbersUnder10.length - 1]}]`
        : `[${numbersUnder10.join('')}]`;

  const regexOver10 =
    numbersOver10.length <= 1
      ? `${numbersOver10.join('')}`
      : `1[${numbersOver10.map((e) => e.toString()[1]).join('')}]`;

  const under10 = regexUnder10 === '' ? '' : `r ${regexUnder10}\\)`;
  const over10 = regexOver10 === '' ? '' : `${regexOver10}\\)`;
  const result = [under10, over10].filter((e) => e !== '').join('|');
  return result === '' ? '' : `"${result}"`;
}

function generateUnwanted(settings: Settings['waystone']['modifier'], round10: boolean): string | null {
  const unwanted = settings.unwantedMods
    .filter((e) => e.isSelected)
    .map((e) => selectedOptionRegex(e, round10))
    .join('|');
  return unwanted.length > 0 ? `"!${unwanted}"` : null;
}

function generateState(settings: Settings['waystone']['state']): string | null {
  const delirious = settings.delirious ? 'delir' : null;
  const corrupted =
    settings.corrupted && !settings.uncorrupted
      ? 'corr'
      : !settings.corrupted && settings.uncorrupted
        ? '!corr'
        : null;

  const out = [delirious, corrupted].filter((s) => s !== null).join(' ');
  return out === '' ? null : out;
}

function generateQuantifiers(waystone: Settings['waystone']): string[] {
  const round10 = waystone.modifier.round10;
  return [
    addQuantifier('m q.*', generateNumberRegex(waystone.itemQuantity, round10)),
    addQuantifier('m rar.*', generateNumberRegex(waystone.itemRarity, round10)),
    addQuantifier('p c.*', generateNumberRegex(waystone.waystoneDropChance, round10)),
    addQuantifier('c m.*', generateNumberRegex(waystone.magicMonsters, round10)),
    addQuantifier('e mo.*', generateNumberRegex(waystone.rareMonsters, round10)),
  ].filter((e) => e !== '');
}

function addQuantifier(prefix: string, string: string) {
  if (string === '') return '';
  return `"${prefix}${string}%"`;
}

function range(start: number, end: number): number[] {
  if (end - start <= 0) return [];
  return [...Array(end - start).keys()].map((i) => i + start);
}
