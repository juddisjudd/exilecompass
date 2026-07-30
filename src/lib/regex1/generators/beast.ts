// Simplified port of poe-vendor-string's Bestiary tool: upstream auto-picks
// the priciest beasts that fit a character budget from live poe.ninja prices
// (see PoE1 regex research notes). ExileCompass has no live-pricing pipeline,
// so this is manual multi-select instead — pick beasts by name, OR their
// regex fragments. Quoted like Tattoo/Runegraft/Scarab: upstream's own Beast
// tool emits this unquoted, but 203/207 bundled beast fragments contain a
// literal space or comma (e.g. "n, f", "c cr"), so pasted as-is those spaces
// get parsed as separate AND-tokens instead of one literal phrase — quoting
// here is a deliberate fix, not a deviation from a working reference.
import type { BeastEntry } from '../types';
import { appendResultExtras, type BeastSettings } from '../settings';

export function generateBeastRegex(beasts: BeastEntry[], settings: BeastSettings): string {
  const byName = new Map(beasts.map((b) => [b.beast, b]));
  const regex = settings.selected
    .map((name) => byName.get(name)?.regex)
    .filter((r): r is string => !!r)
    .join('|');
  const base = regex ? `"${regex}"` : '';
  return appendResultExtras(base, settings.resultSettings);
}
