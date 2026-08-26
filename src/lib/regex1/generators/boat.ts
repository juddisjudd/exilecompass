// Ported from poe.re's poe/src/pages/boat/BoatOutput.ts (+ the boat-area list
// from Boat.tsx). Same token/optimization-table data shape as map mods, but
// only a wanted-mods list — no exclusions or yields.
import type { MapModsData } from '../types';
import { appendResultExtras, type BoatSettings } from '../settings';

export const BOAT_AREAS: { regex: string; description: string }[] = [
  { regex: 'Diving Shoals', description: 'Area has a Trathen mercenary encounter unique to here' },
  { regex: 'Pelagic Abyss', description: "Area contains a big abyssal pit that spawns abyss monsters which have a chance to drop Merrick's Ducat" },
  { regex: 'Sea Pillars', description: 'Area contains sea pillars which have 1 rare enemy each' },
  { regex: 'Sunken Totems', description: 'Area contains spirits of the Ancestors — the bosses from the Trial of the Ancestors' },
  { regex: "Brine King's Domain", description: 'Rare monsters within have "The Pantheon" Brine King mod' },
  { regex: 'Clam-Infested shelf', description: 'Area contains a large amount of Treasure Clams' },
  { regex: "Kishara's rest", description: 'Lets you fight Velka in a voyage' },
  { regex: 'Lost Ruins', description: 'Area contains Vaal Vessels' },
  { regex: 'Anchorfield', description: 'Area contains Sunken Loot' },
  { regex: 'Infested Bathyspheres', description: 'Area contains random rewards (sunken loot, gold)' },
  { regex: 'Eldritch Depths', description: 'Area contains scary monsters' },
];

const ADJACENT = 'adjacent';

export function generateBoatRegex(data: MapModsData, s: BoatSettings): string {
  const tokens = s.goodIds
    .map((id) => data.tokens.find((t) => t.id === id)?.regex)
    .filter((r): r is string => r !== undefined);

  const result: string[] = [];
  if (s.allGoodMods) {
    result.push(...tokens.map((t) => (t.includes(' ') ? `"${t}"` : t)));
    if (s.areas.length > 0) result.push(`"${s.areas.join('|')}"`);
  } else {
    const combined = [...tokens, ...s.areas];
    if (combined.length > 0) result.push(`"${combined.join('|')}"`);
  }
  if (s.filterAdjacent) result.push(s.adjacentInclude ? `"${ADJACENT}"` : `"!${ADJACENT}"`);

  return appendResultExtras(result.join(' '), s.resultSettings);
}
