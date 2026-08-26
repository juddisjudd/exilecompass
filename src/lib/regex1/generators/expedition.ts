// Simplified port of poe.re's Expedition tool: upstream can
// auto-add filler base types from live poe.ninja prices (see PoE1 regex
// research notes) — dropped, no live-pricing pipeline. Core algorithm is
// otherwise ported verbatim: dedupe selected base types, join their
// pre-picked regex fragments with `|`, strip any embedded quotes, then wrap
// the whole alternation in one single outer pair of quotes. This exploits
// PoE's search box treating a quoted phrase as one literal continuous string
// while still honoring `|` inside it — don't quote per-fragment instead.
import type { ExpeditionData } from '../types';
import { appendResultExtras, type ExpeditionSettings } from '../settings';

export function generateExpeditionRegex(data: ExpeditionData, settings: ExpeditionSettings): string {
  const unique = Array.from(new Set(settings.selectedBaseTypes));
  const regex = unique
    .map((baseType) => data[baseType]?.regex)
    .filter((r): r is string => !!r)
    .join('|')
    .replaceAll('"', '');
  const base = regex ? `"${regex}"` : '';
  return appendResultExtras(base, settings.resultSettings);
}
