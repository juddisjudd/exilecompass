#!/usr/bin/env bun
// Converts the vendored poe.re data modules under tools/poe1-regex-source/
// (mirroring poe.re's poe/src/generated/ layout) into lean JSON the PoE1 Regex
// tab loads lazily at runtime (src/lib/regex1/loaders.ts, served from
// static/generated/poe1/*.min.json).
//
// Normally run through `bun run sync-regex` (tools/sync-regex-upstream.mjs);
// `bun run build:poe1-regex-data` regenerates from the vendored copies alone.
// Every output is shape-checked so a silent upstream format change fails here
// instead of shipping a Regex tab that loads empty lists.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'poe1-regex-source');
const OUT_DIR = join(__dirname, '../static/generated/poe1');

mkdirSync(OUT_DIR, { recursive: true });

function fail(name, what) {
  console.error(`[poe1-regex-data] ${name}: unexpected shape — ${what}`);
  process.exit(1);
}

const list = (name, arr, min, keys) => {
  if (!Array.isArray(arr) || arr.length < min) fail(name, `expected ≥${min} entries, got ${arr?.length}`);
  for (const k of keys) if (!arr.every((e) => k in e)) fail(name, `entries lack "${k}"`);
};
const record = (name, obj, min, keys) => {
  const values = obj && typeof obj === 'object' ? Object.values(obj) : [];
  list(name, values, min, keys);
};

function write(name, data, check) {
  check(data);
  const out = join(OUT_DIR, `${name}.min.json`);
  const json = JSON.stringify(data);
  writeFileSync(out, json);
  const kb = Math.round(Buffer.byteLength(json) / 1024);
  console.log(`wrote ${out} (${kb} KB)`);
}

const load = (file) => import(join(SRC_DIR, file));

const { itemRegex } = await load('GeneratedItemModsPOE1.ts');
write('ItemMods', itemRegex, (d) => {
  record('ItemMods', d, 30, ['basetype', 'categoryRegex']);
  if (!Object.values(d).every((item) => Array.isArray(item.categoryRegex))) fail('ItemMods', 'categoryRegex is not an array');
});

const { basetypes } = await load('GeneratedItemBasesPOE1.ts');
write('ItemBases', basetypes, (d) => list('ItemBases', d, 30, ['name', 'items']));

const { beastRegex } = await load('GeneratedBeastRegex.ts');
write('BeastRegex', beastRegex, (d) => list('BeastRegex', d, 20, ['beast', 'regex', 'harvest', 'red']));

const { tattooRegex } = await load('GeneratedTattoo.ts');
write('Tattoo', tattooRegex, (d) => list('Tattoo', d, 20, ['tattoo', 'regex', 'description']));

const { runegraftRegex } = await load('GeneratedRunegraft.ts');
write('Runegraft', runegraftRegex, (d) => list('Runegraft', d, 10, ['regex', 'description']));

const { scarabs } = await load('GeneratedScarabs.ts');
write('Scarabs', scarabs, (d) => record('Scarabs', d, 50, ['name', 'regex']));

const { jewelRegular, jewelAbyss } = await load('GeneratedJewel.ts');
write('Jewel', { jewelRegular, jewelAbyss }, (d) => {
  list('Jewel.jewelRegular', d.jewelRegular, 10, ['mod', 'regex', 'isPrefix']);
  list('Jewel.jewelAbyss', d.jewelAbyss, 10, ['mod', 'regex', 'isPrefix']);
});

const { mapNames } = await load('GeneratedMapNames.ts');
write('MapNames', mapNames, (d) => record('MapNames', d, 100, ['name', 'matchSafe']));

const { baseTypeRegex } = await load('GeneratedExpedition.ts');
write('Expedition', baseTypeRegex, (d) => record('Expedition', d, 100, ['baseType', 'regex', 'items']));

const { heistContractTypes, heistTargetValues } = await load('GeneratedHeist.ts');
write('Heist', { heistContractTypes, heistTargetValues }, (d) => {
  record('Heist.heistContractTypes', d.heistContractTypes, 5, ['name', 'matchSafe']);
  record('Heist.heistTargetValues', d.heistTargetValues, 5, ['name', 'matchSafe']);
});

const { flaskPrefix, flaskSuffix } = await load('GeneratedFlaskMods.ts');
write('FlaskMods', { flaskPrefix, flaskSuffix }, (d) => {
  list('FlaskMods.flaskPrefix', d.flaskPrefix, 5, ['regex', 'mods']);
  list('FlaskMods.flaskSuffix', d.flaskSuffix, 5, ['regex', 'mods']);
});

const { regexGems } = await load('gems/Generated.Gems.English.ts');
write('Gems', regexGems.tokens, (d) => list('Gems', d, 300, ['id', 'regex', 'rawText', 'options']));

const { regexMapModsENGLISH } = await load('mapmods/Generated.MapModsV3.ENGLISH.ts');
write('MapMods', regexMapModsENGLISH, (d) => {
  list('MapMods.tokens', d.tokens, 50, ['id', 'regex', 'rawText', 'options']);
  record('MapMods.optimizationTable', d.optimizationTable, 10, ['ids', 'regex']);
});

const { regexBoatModsENGLISH } = await load('GeneratedBoatMods.ts');
write('BoatMods', regexBoatModsENGLISH, (d) => {
  list('BoatMods.tokens', d.tokens, 50, ['id', 'regex', 'rawText', 'options']);
  record('BoatMods.optimizationTable', d.optimizationTable, 10, ['ids', 'regex']);
});
