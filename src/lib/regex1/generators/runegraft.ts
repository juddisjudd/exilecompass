// Simplified port of poe-vendor-string's Runegraft tool: upstream is entirely
// price-driven, with an "include tattoos" merge sharing one price-sorted
// budget (see PoE1 regex research notes). Without live pricing this becomes
// two independent manual multi-selects OR'd together, quoted (matching
// upstream's quoted output).
import type { NamedRegexEntry } from '../types';
import type { RunegraftSettings } from '../settings';

export function generateRunegraftRegex(
  runegrafts: NamedRegexEntry[],
  tattoos: NamedRegexEntry[],
  settings: RunegraftSettings,
): string {
  const runegraftLookup = new Map(runegrafts.map((r) => [r.runegraft, r]));
  const tattooLookup = new Map(tattoos.map((t) => [t.tattoo, t]));

  const runegraftRegexes = settings.selected.map((name) => runegraftLookup.get(name)?.regex).filter((r): r is string => !!r);
  const tattooRegexes = settings.includeTattoos
    ? settings.selectedTattoos.map((name) => tattooLookup.get(name)?.regex).filter((r): r is string => !!r)
    : [];

  const regex = runegraftRegexes.concat(tattooRegexes).join('|');
  return regex ? `"${regex}"` : '';
}
