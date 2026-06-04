// Relic query — fully grouped (OR within a group, AND across groups).
import { formatExcludes, groupsToTerms, type Settings } from '../settings';
import { selectedOptionRegex } from '../affix';

export function generateRelicRegex(settings: Settings): string {
  const r = settings.relic;
  const terms = [
    ...groupsToTerms(r.groups, (o) => selectedOptionRegex(o, false)),
    r.resultSettings.customText || null,
    formatExcludes(r.resultSettings.excludeKeywords) || null,
  ].filter((e) => e !== null && e !== '');

  return terms.join(' ').trim();
}
