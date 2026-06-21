// Runtime loader for the crafting guides.
//
// Guides are authored in the exilecompass-guides repo and published as one
// guides.json (GitHub Pages → guides.exilecompass.com, which serves permissive
// CORS so this client-side fetch works), so the overlay picks up new/updated
// guides without an app release. We layer three sources for resilience:
//   1. Remote fetch (source of truth) — refreshes in the background on open.
//   2. localStorage cache (last successful fetch) — instant + survives offline.
//   3. bundled snapshot (guides.fallback.json) — works on first run / offline.
//
// Refresh the bundled snapshot before a release with `bun run sync-guides`.

import type { CraftingGuideData } from './crafting';
import fallback from './guides.fallback.json';

export const GUIDES_URL = 'https://guides.exilecompass.com/guides.json';
const CACHE_KEY = 'CRAFTING_GUIDES_CACHE_V1';

const bundled = fallback as CraftingGuideData[];

function isGuideArray(data: unknown): data is CraftingGuideData[] {
  return Array.isArray(data) && data.length > 0 && data.every((g) => g && typeof g.id === 'string');
}

// Test toggle: set `localStorage.GUIDES_STRICT = '1'` (then reopen the Craft tab)
// to disable the cache + bundled fallback entirely — the tab stays empty until
// the remote fetch succeeds, proving guides come from the network, not locally.
function strictMode(): boolean {
  try {
    return localStorage.getItem('GUIDES_STRICT') === '1';
  } catch {
    return false;
  }
}

/** Best guides available synchronously: last cached fetch, else the bundled snapshot. */
export function initialGuides(): CraftingGuideData[] {
  if (strictMode()) {
    console.info('[guides] strict mode — no cache/fallback; awaiting remote fetch');
    return [];
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isGuideArray(data)) {
        console.info(`[guides] initial: ${data.length} guide(s) from localStorage cache`);
        return data;
      }
    }
  } catch {
    // localStorage unavailable (e.g. prerender) or corrupt cache — use bundled.
  }
  console.info(`[guides] initial: ${bundled.length} guide(s) from bundled snapshot`);
  return bundled;
}

/** Fetch the latest guides from the CDN; cache + return on success, null on failure. */
export async function fetchGuides(): Promise<CraftingGuideData[] | null> {
  try {
    const res = await fetch(GUIDES_URL, { cache: 'no-cache' });
    if (!res.ok) {
      console.warn(`[guides] remote refresh failed: HTTP ${res.status} — keeping cached/bundled`);
      return null;
    }
    const data = await res.json();
    if (!isGuideArray(data)) {
      console.warn('[guides] remote returned invalid data — keeping cached/bundled');
      return null;
    }
    if (!strictMode()) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        // Cache write is best-effort.
      }
    }
    console.info(`[guides] refreshed ${data.length} guide(s) from ${GUIDES_URL}`);
    return data;
  } catch (err) {
    console.warn(
      `[guides] remote refresh failed — keeping cached/bundled: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
