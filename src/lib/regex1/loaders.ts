// Lazy, cached loaders for the PoE1 regex data. Each JSON file is only
// fetched the first time its category is opened, mirroring src/lib/regex's
// loadWaystoneAffixes/loadTabletAffixes pattern (files live in
// static/generated/poe1/ and are served at the site root).

import type {
  BeastEntry,
  ExpeditionData,
  FlaskModsData,
  GemToken,
  HeistData,
  ItemModsData,
  BaseType,
  JewelData,
  MapModsData,
  MapNamesData,
  NamedRegexEntry,
  ScarabsData,
} from './types';

function cachedFetch<T>(path: string): () => Promise<T> {
  let cache: Promise<T> | null = null;
  return () => {
    if (!cache) {
      cache = fetch(path)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
          return r.json() as Promise<T>;
        })
        .catch((e) => {
          // Don't cache a failed fetch — let the next attempt (e.g. re-opening
          // the tab) retry instead of being stuck on a permanently-rejected
          // promise for the rest of the session.
          cache = null;
          console.error(`[regex1] failed to load ${path}:`, e);
          throw e;
        });
    }
    return cache;
  };
}

export const loadGems = cachedFetch<GemToken[]>('/generated/poe1/Gems.min.json');
export const loadItemMods = cachedFetch<ItemModsData>('/generated/poe1/ItemMods.min.json');
export const loadItemBases = cachedFetch<BaseType[]>('/generated/poe1/ItemBases.min.json');
export const loadJewel = cachedFetch<JewelData>('/generated/poe1/Jewel.min.json');
export const loadMapMods = cachedFetch<MapModsData>('/generated/poe1/MapMods.min.json');
export const loadMapNames = cachedFetch<MapNamesData>('/generated/poe1/MapNames.min.json');
export const loadExpedition = cachedFetch<ExpeditionData>('/generated/poe1/Expedition.min.json');
export const loadHeist = cachedFetch<HeistData>('/generated/poe1/Heist.min.json');
export const loadFlaskMods = cachedFetch<FlaskModsData>('/generated/poe1/FlaskMods.min.json');
export const loadBeasts = cachedFetch<BeastEntry[]>('/generated/poe1/BeastRegex.min.json');
export const loadTattoos = cachedFetch<NamedRegexEntry[]>('/generated/poe1/Tattoo.min.json');
export const loadRunegrafts = cachedFetch<NamedRegexEntry[]>('/generated/poe1/Runegraft.min.json');
export const loadScarabs = cachedFetch<ScarabsData>('/generated/poe1/Scarabs.min.json');
