#!/usr/bin/env bun
// One-shot generator: fetches GGG's official skilltree-export data for the
// version(s) below (pinned commits, from HeartofPhos/exile-leveling's seeding
// map) and transforms it via the vendored buildSkillTree into the lean
// per-version JSON the passive-tree viewer loads lazily.
//
// Run manually (`bun run build:tree`) — not chained into dev/build/check.
// To support more tree versions, add entries here and re-run; the viewer
// discovers shipped versions via import.meta.glob.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSkillTree } from './poe1-tree-source/tree.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/lib/leveling/tree');

// Latest first; add older versions if builds need them.
const PASSIVE_TREE_JSON = {
	'3_28':
		'https://raw.githubusercontent.com/grindinggear/skilltree-export/648e492b17d49d7213c63f4c1e0aa561617d5ad1/data.json',
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [version, url] of Object.entries(PASSIVE_TREE_JSON)) {
	console.log(`fetching ${version}…`);
	const raw = await fetch(url).then((r) => {
		if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
		return r.json();
	});
	const skillTree = buildSkillTree(raw);
	const out = join(OUT_DIR, `${version}.json`);
	writeFileSync(out, JSON.stringify(skillTree));
	const kb = Math.round(Buffer.byteLength(JSON.stringify(skillTree)) / 1024);
	console.log(`wrote ${out} (${kb} KB)`);
}
