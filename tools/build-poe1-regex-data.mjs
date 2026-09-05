#!/usr/bin/env bun
// Converts the vendored poe.re data under tools/poe1-regex-source/ (mirroring
// poe.re's poe/ layout: JSON in generated/, the modules it still authors as TS
// in src/generated/) into lean JSON the PoE1 Regex tab loads lazily at runtime
// (src/lib/regex1/loaders.ts, served from static/generated/poe1/*.min.json).
//
// Normally run through `bun run sync-regex` (tools/sync-regex-upstream.mjs);
// `bun run build:poe1-regex-data` regenerates from the vendored copies alone.
// Every output is shape-checked so a silent upstream format change fails here
// instead of shipping a Regex tab that loads empty lists.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const data = (file) => JSON.parse(readFileSync(join(SRC_DIR, 'generated', file), 'utf8'));
const load = (file) => import(join(SRC_DIR, 'src/generated', file));
const byKey = (arr, key) => Object.fromEntries(arr.map((e) => [e[key], e]));

write('ItemMods', byKey(data('item/Generated.Item.json'), 'basetype'), (d) => {
  record('ItemMods', d, 30, ['basetype', 'categoryRegex']);
  if (!Object.values(d).every((item) => Array.isArray(item.categoryRegex))) fail('ItemMods', 'categoryRegex is not an array');
});

write('ItemBases', data('item/Generated.Basetypes.Item.json'), (d) => list('ItemBases', d, 30, ['name', 'items']));

// `harvest` is only emitted on the beasts that have it, so it isn't a required key.
write('BeastRegex', data('beast/Generated.BeastRegex.json'), (d) => list('BeastRegex', d, 20, ['beast', 'regex', 'red']));

const { tattooRegex } = await load('GeneratedTattoo.ts');
write('Tattoo', tattooRegex, (d) => list('Tattoo', d, 20, ['tattoo', 'regex', 'description']));

const { runegraftRegex } = await load('GeneratedRunegraft.ts');
write('Runegraft', runegraftRegex, (d) => list('Runegraft', d, 10, ['regex', 'description']));

write('Scarabs', data('scarabs/Generated.Scarabs.json'), (d) => record('Scarabs', d, 50, ['name', 'regex']));

const { regular, abyss } = data('jewel/Generated.Jewel.json');
write('Jewel', { jewelRegular: regular, jewelAbyss: abyss }, (d) => {
  list('Jewel.jewelRegular', d.jewelRegular, 10, ['mod', 'regex', 'isPrefix']);
  list('Jewel.jewelAbyss', d.jewelAbyss, 10, ['mod', 'regex', 'isPrefix']);
});

write('Expedition', data('expedition/Generated.Expedition.json').baseTypeRegex, (d) =>
  record('Expedition', d, 100, ['baseType', 'regex', 'items']),
);

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

write('MapMods', data('mapmods/Generated.Map.ENGLISH.json'), (d) => {
  list('MapMods.tokens', d.tokens, 50, ['id', 'regex', 'rawText', 'options']);
  record('MapMods.optimizationTable', d.optimizationTable, 10, ['ids', 'regex']);
});

write('BoatMods', data('boatmods/Generated.BoatMods.ENGLISH.json'), (d) => {
  list('BoatMods.tokens', d.tokens, 50, ['id', 'regex', 'rawText', 'options']);
  record('BoatMods.optimizationTable', d.optimizationTable, 10, ['ids', 'regex']);
});
