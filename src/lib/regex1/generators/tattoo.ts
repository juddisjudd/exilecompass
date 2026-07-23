// Simplified port of poe-vendor-string's Tattoo tool: upstream is entirely
// price-driven (min/max chaos value, no manual picker at all — see PoE1 regex
// research notes). ExileCompass has no live-pricing pipeline, so this is
// manual multi-select instead — OR the selected tattoos' regex fragments,
// quoted (matching upstream's quoted output).
import type { NamedRegexEntry } from '../types';
import type { TattooSettings } from '../settings';

export function generateTattooRegex(tattoos: NamedRegexEntry[], settings: TattooSettings): string {
  const byName = new Map(tattoos.map((t) => [t.tattoo, t]));
  const regex = settings.selected
    .map((name) => byName.get(name)?.regex)
    .filter((r): r is string => !!r)
    .join('|');
  return regex ? `"${regex}"` : '';
}
