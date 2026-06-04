// Lazy, cached loaders for the generated affix data. Mirrors poe2.re's
// loadWaystoneAffixes.ts / loadTabletAffixes.ts. The JSON files live in
// static/generated/ and are served at the site root.

import { parseAffixToken } from './affix';
import type { ParsedAffix, RegexResult } from './types';

export interface WaystoneAffix extends ParsedAffix {
  prefix: boolean;
}
export type TabletAffix = ParsedAffix;

type WaystoneOptions = { name: string; prefix: boolean; tags: string[] };
type TabletOptions = { prefix: boolean; tags: string[] };

let waystoneCache: Promise<WaystoneAffix[]> | null = null;
let tabletCache: Promise<TabletAffix[]> | null = null;

export function loadWaystoneAffixes(): Promise<WaystoneAffix[]> {
  if (!waystoneCache) {
    waystoneCache = fetch('/generated/Generated.Waystone.min.json')
      .then((r) => r.json() as Promise<RegexResult<WaystoneOptions>>)
      .then((json) =>
        json.tokens
          .map((token) => ({
            ...parseAffixToken(token),
            prefix: token.options.prefix,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
  }
  return waystoneCache;
}

export function loadTabletAffixes(): Promise<TabletAffix[]> {
  if (!tabletCache) {
    tabletCache = fetch('/generated/Generated.Tablet.min.json')
      .then((r) => r.json() as Promise<RegexResult<TabletOptions>>)
      .then((json) =>
        json.tokens.map(parseAffixToken).sort((a, b) => a.name.localeCompare(b.name)),
      );
  }
  return tabletCache;
}
