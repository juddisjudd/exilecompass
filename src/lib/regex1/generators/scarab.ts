// Ported from poe.re's poe/src/pages/scarab/ScarabOutput.ts, minus the
// price-driven "auto select cheap scarabs" bulk action (no live-pricing
// pipeline — see PoE1 regex research notes). Manual multi-select, quoted
// OR-join, matching upstream's own manual-selection output exactly.
import type { ScarabsData } from '../types';
import { appendResultExtras, type ScarabSettings } from '../settings';

export function generateScarabRegex(data: ScarabsData, settings: ScarabSettings): string {
  const regex = settings.selected
    .map((name) => data[name]?.regex)
    .filter((r): r is string => !!r)
    .join('|');
  const base = regex ? `"${regex}"` : '';
  return appendResultExtras(base, settings.resultSettings);
}
