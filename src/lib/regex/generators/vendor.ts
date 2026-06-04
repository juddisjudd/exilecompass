// Vendor (stash) query. Item/character level are structural AND terms; the
// rest of the selection is grouped (OR within a group, AND across groups).
import { formatExcludes, groupsToTerms, type Settings } from '../settings';
import { selectedOptionRegex } from '../affix';

export function generateVendorRegex(settings: Settings): string {
  const v = settings.vendor;
  const terms = [
    itemLevel(v.itemLevel),
    characterLevel(v.characterLevel),
    ...groupsToTerms(v.groups, (o) => selectedOptionRegex(o, false)),
    v.resultSettings.customText || null,
    formatExcludes(v.resultSettings.excludeKeywords) || null,
  ].filter((e) => e !== null && e !== '');

  return terms.join(' ').trim();
}

function itemLevel(settings: Settings['vendor']['itemLevel']): string | null {
  return createLevelRangeRegex(settings.min, settings.max, 'm level: ');
}

function characterLevel(settings: Settings['vendor']['characterLevel']): string | null {
  return createLevelRangeRegex(settings.min, settings.max, 's: level ');
}

function createLevelRangeRegex(min: number, max: number, prefix: string): string | null {
  if (min === 0 && max === 0) return null;
  if (max > 0 && min > max) return null;
  const effectiveMax = max === 0 ? 99 : max;

  let body: string;
  if (min === 0 && effectiveMax === 99) {
    body = `${prefix}(\\d{1,2})\\b`;
  } else if (min > 0 && min === effectiveMax) {
    body = `${prefix}(${min})\\b`;
  } else {
    const singleDigits = min <= 9 ? rangePattern(min, Math.min(9, effectiveMax)) : '';
    const tens = Math.floor(Math.min(Math.max(min, 10), effectiveMax) / 10);
    const maxTens = Math.floor(effectiveMax / 10);
    const patterns: string[] = [];
    if (singleDigits) patterns.push(singleDigits);
    if (tens <= maxTens) {
      if (tens === maxTens) {
        const minOnes = min > 9 ? min % 10 : 0;
        const maxOnes = effectiveMax % 10;
        patterns.push(`${tens}[${minOnes}-${maxOnes}]`);
      } else {
        if (min <= tens * 10 + 9 && min > tens * 10) {
          patterns.push(`${tens}[${min % 10}-9]`);
        } else if (min <= tens * 10) {
          patterns.push(`${tens}\\d`);
        }
        if (maxTens > tens + 1) patterns.push(`[${tens + 1}-${maxTens - 1}]\\d`);
        if (effectiveMax % 10 > 0) patterns.push(`${maxTens}[0-${effectiveMax % 10}]`);
        else patterns.push(`${maxTens}0`);
      }
    }
    body = `${prefix}(${patterns.join('|')})\\b`;
  }
  // Quoted so the spaces in the prefix don't split it into separate AND tokens.
  return `"${body}"`;
}

function rangePattern(start: number, end: number): string {
  if (start > end) return '';
  if (start === end) return start.toString();
  if (start === 0 && end === 9) return '\\d';
  return `[${start}-${end}]`;
}
