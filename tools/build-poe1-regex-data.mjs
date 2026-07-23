#!/usr/bin/env bun
// One-shot generator: converts the vendored poe-vendor-string (poe.re) generated
// data modules under tools/poe1-regex-source/ into lean JSON the PoE1 Regex tab
// loads lazily at runtime (mirrors build-poe1-tree.mjs's fetch pattern, and
// src/lib/regex/loaders.ts's static/generated/*.min.json convention).
//
// Run manually (`bun run build:poe1-regex-data`) after re-syncing source files
// from https://github.com/veiset/poe-vendor-string.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'poe1-regex-source');
const OUT_DIR = join(__dirname, '../static/generated/poe1');

mkdirSync(OUT_DIR, { recursive: true });

function write(name, data) {
	const out = join(OUT_DIR, `${name}.min.json`);
	const json = JSON.stringify(data);
	writeFileSync(out, json);
	const kb = Math.round(Buffer.byteLength(json) / 1024);
	console.log(`wrote ${out} (${kb} KB)`);
}

const { itemRegex } = await import(join(SRC_DIR, 'ItemMods.ts'));
write('ItemMods', itemRegex);

const { basetypes } = await import(join(SRC_DIR, 'ItemBases.ts'));
write('ItemBases', basetypes);

const { beastRegex } = await import(join(SRC_DIR, 'BeastRegex.ts'));
write('BeastRegex', beastRegex);

const { tattooRegex } = await import(join(SRC_DIR, 'Tattoo.ts'));
write('Tattoo', tattooRegex);

const { runegraftRegex } = await import(join(SRC_DIR, 'Runegraft.ts'));
write('Runegraft', runegraftRegex);

const { scarabs } = await import(join(SRC_DIR, 'Scarabs.ts'));
write('Scarabs', scarabs);

const { jewelRegular, jewelAbyss } = await import(join(SRC_DIR, 'Jewel.ts'));
write('Jewel', { jewelRegular, jewelAbyss });

const { mapNames } = await import(join(SRC_DIR, 'MapNames.ts'));
write('MapNames', mapNames);

const { baseTypeRegex } = await import(join(SRC_DIR, 'Expedition.ts'));
write('Expedition', baseTypeRegex);

const { heistContractTypes, heistTargetValues } = await import(join(SRC_DIR, 'Heist.ts'));
write('Heist', { heistContractTypes, heistTargetValues });

const { flaskPrefix, flaskSuffix } = await import(join(SRC_DIR, 'FlaskMods.ts'));
write('FlaskMods', { flaskPrefix, flaskSuffix });

const { regexGems } = await import(join(SRC_DIR, 'Gems.English.ts'));
write('Gems', regexGems.tokens);

const { regexMapModsENGLISH } = await import(join(SRC_DIR, 'MapModsV3.English.ts'));
write('MapMods', regexMapModsENGLISH);
