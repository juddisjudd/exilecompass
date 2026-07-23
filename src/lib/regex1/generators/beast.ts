// Simplified port of poe-vendor-string's Bestiary tool: upstream auto-picks
// the priciest beasts that fit a character budget from live poe.ninja prices
// (see PoE1 regex research notes). ExileCompass has no live-pricing pipeline,
// so this is manual multi-select instead — pick beasts by name, OR their
// regex fragments, unquoted (matching upstream's own unquoted output, unlike
// Tattoo/Runegraft/Scarab which wrap in quotes).
import type { BeastEntry } from '../types';
import type { BeastSettings } from '../settings';

export function generateBeastRegex(beasts: BeastEntry[], settings: BeastSettings): string {
  const byName = new Map(beasts.map((b) => [b.beast, b]));
  return settings.selected
    .map((name) => byName.get(name)?.regex)
    .filter((r): r is string => !!r)
    .join('|');
}
