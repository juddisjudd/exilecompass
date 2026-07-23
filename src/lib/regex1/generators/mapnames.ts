// Ported from poe-vendor-string's src/utils/MapNameOutput.ts.
import type { MapNamesData } from '../types';
import type { MapNamesSettings } from '../settings';

export function generateMapNameRegex(data: MapNamesData, settings: MapNamesSettings): string {
  const modStr = settings.selected
    .map((key) => data[key]?.matchSafe)
    .filter((s): s is string => !!s)
    .join('|')
    .replaceAll('"', '');
  if (!modStr) return '';
  return settings.mapTabSearch ? modStr : `"${modStr}"`;
}
