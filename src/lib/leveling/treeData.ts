// Lazy per-version passive-tree data loading (Vite import.meta.glob).
// Split from tree.ts so the decode/delta/svg logic stays runtime-agnostic.
import type { SkillTree } from './vendor/tree.js';
import { assembleTree, type LoadedTree } from './tree.js';

const TREE_JSON = import.meta.glob('./tree/*.json');

const treeCache = new Map<string, Promise<LoadedTree | null>>();

export function availableTreeVersions(): string[] {
  return Object.keys(TREE_JSON)
    .map((p) => /\/([^/]+)\.json$/.exec(p)?.[1] ?? '')
    .filter(Boolean);
}

export function loadSkillTree(version: string): Promise<LoadedTree | null> {
  let cached = treeCache.get(version);
  if (!cached) {
    const loader = TREE_JSON[`./tree/${version}.json`];
    cached = loader
      ? loader().then((mod) =>
          assembleTree(version, (mod as { default: SkillTree.Data }).default),
        )
      : Promise.resolve(null);
    treeCache.set(version, cached);
  }
  return cached;
}
