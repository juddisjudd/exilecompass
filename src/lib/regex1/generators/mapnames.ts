// Ported from poe-vendor-string's src/utils/MapNameOutput.ts.
import type { MapNamesData } from '../types';
import { appendResultExtras, type MapNamesSettings } from '../settings';

export function generateMapNameRegex(data: MapNamesData, settings: MapNamesSettings): string {
  const modStr = settings.selected
    .map((key) => data[key]?.matchSafe)
    .filter((s): s is string => !!s)
    .join('|')
    .replaceAll('"', '');
  const base = modStr ? (settings.mapTabSearch ? modStr : `"${modStr}"`) : '';
  return appendResultExtras(base, settings.resultSettings);
}
