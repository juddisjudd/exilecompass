#!/usr/bin/env bun
// Pulls the regex data ExileCompass vendors from a local checkout of
// https://github.com/veiset/poe.re, regenerates the PoE1 JSON
// (build-poe1-regex-data.mjs), and pins the upstream commit in
// tools/regex-upstream.lock.json.
//
//   bun run sync-regex                    # upstream checkout at ../poe.re
//   bun run sync-regex --upstream <dir>
//
// CI (.github/workflows/regex-sync.yml) runs the same script on a schedule and
// releases a patch version when anything changed. With GITHUB_OUTPUT set it
// writes `changed=true|false` and `commit=<sha>` for the workflow.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(root, 'tools/regex-upstream.lock.json');
const POE1_SRC = 'tools/poe1-regex-source';
const POE1_OUT = join(root, 'static/generated/poe1');

const args = process.argv.slice(2);
const upstreamIdx = args.indexOf('--upstream');
const upstream = resolve(root, upstreamIdx >= 0 ? args[upstreamIdx + 1] : '../poe.re');

const minify = (text) => JSON.stringify(JSON.parse(text));

// Upstream path (relative to the poe.re checkout) → local path. Only what the
// app actually consumes; poe.re's other languages, trade ids and UI stay there.
// An optional `transform` rewrites the text before it lands locally.
const POE1_MODULES = [
  'GeneratedItemModsPOE1.ts',
  'GeneratedItemBasesPOE1.ts',
  'GeneratedBeastRegex.ts',
  'GeneratedBoatMods.ts',
  'GeneratedTattoo.ts',
  'GeneratedRunegraft.ts',
  'GeneratedScarabs.ts',
  'GeneratedJewel.ts',
  'GeneratedExpedition.ts',
  'GeneratedHeist.ts',
  'GeneratedFlaskMods.ts',
  'gems/Generated.Gems.English.ts',
  'mapmods/Generated.MapModsV3.ENGLISH.ts',
];
const FILES = {
  ...Object.fromEntries(POE1_MODULES.map((f) => [`poe/src/generated/${f}`, { to: `${POE1_SRC}/${f}` }])),
  'poe2/public/generated/Generated.Waystone.min.json': { to: 'static/generated/Generated.Waystone.min.json' },
  'poe2/public/generated/Generated.Tablet.min.json': { to: 'static/generated/Generated.Tablet.min.json' },
  'poe2/public/generated/Generated.Item.json': { to: 'static/generated/Generated.Item.min.json', transform: minify },
  'poe2/public/generated/Generated.Basetypes.Item.json': { to: 'static/generated/Generated.Basetypes.Item.min.json', transform: minify },
  'poe2/src/generated/Relic.Gen.ts': { to: 'src/lib/regex/relicData.ts' },
};

function die(msg) {
  console.error(`[sync-regex] ${msg}`);
  process.exit(1);
}

function git(...argv) {
  return execFileSync('git', ['-C', upstream, ...argv], { stdio: 'pipe' }).toString().trim();
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
}

function snapshotOutputs() {
  if (!existsSync(POE1_OUT)) return new Map();
  return new Map(readdirSync(POE1_OUT).map((f) => [f, readFileSync(join(POE1_OUT, f), 'utf8')]));
}

const every = (arr, min, pred) => Array.isArray(arr) && arr.length >= min && arr.every(pred);

function validatePoe2(local, text) {
  const name = local.split('/').pop();
  if (name === 'Generated.Waystone.min.json' || name === 'Generated.Tablet.min.json') {
    const json = JSON.parse(text);
    const ok = every(json.tokens, 20, (t) => typeof t.regex === 'string' && typeof t.rawText === 'string' && typeof t.options?.prefix === 'boolean');
    if (!ok) die(`${local}: unexpected shape (tokens[] with regex/rawText/options.prefix)`);
  } else if (name === 'Generated.Item.min.json') {
    const ok = every(JSON.parse(text), 30, (e) =>
      typeof e.basetype === 'string' &&
      every(e.itemRegexForCategory, 0, (c) => typeof c.modCategory === 'string' && every(c.modifiers, 0, (m) => typeof m.regex === 'string' && Array.isArray(m.stats) && m.regexPosition)),
    );
    if (!ok) die(`${local}: unexpected shape (basetype + itemRegexForCategory[].modifiers[])`);
  } else if (name === 'Generated.Basetypes.Item.min.json') {
    if (!every(JSON.parse(text), 30, (e) => typeof e.base === 'string' && Array.isArray(e.item))) die(`${local}: unexpected shape (base + item[])`);
  } else if (name === 'relicData.ts') {
    const entries = (text.match(/^\s*regex: "/gm) ?? []).length;
    if (!text.includes('export const relicRegex') || entries < 20) die(`${local}: unexpected shape (relicRegex with ${entries} entries)`);
  }
}

if (!existsSync(upstream)) die(`upstream checkout not found at ${upstream} (pass --upstream <dir>)`);
for (const rel of Object.keys(FILES)) {
  if (!existsSync(join(upstream, rel))) die(`missing in upstream: ${rel} — poe.re moved or renamed it; update FILES in this script`);
}

const commit = git('rev-parse', 'HEAD');
const date = git('log', '-1', '--format=%cI');
const changed = [];

for (const [rel, { to, transform }] of Object.entries(FILES)) {
  const raw = readText(join(upstream, rel));
  const next = transform ? transform(raw) : raw;
  const target = join(root, to);
  if (readText(target) === next) continue;
  validatePoe2(to, next);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next);
  changed.push(to);
}

const before = snapshotOutputs();
execFileSync('bun', [join(root, 'tools/build-poe1-regex-data.mjs')], { cwd: root, stdio: 'inherit' });
for (const [name, content] of snapshotOutputs()) {
  if (before.get(name) !== content) changed.push(`static/generated/poe1/${name}`);
}

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;
if (changed.length > 0 || lock?.commit !== commit) {
  writeFileSync(LOCK, JSON.stringify({ repository: 'https://github.com/veiset/poe.re', commit, date }, null, 2) + '\n');
}

if (changed.length === 0) {
  console.log(`[sync-regex] up to date with poe.re@${commit.slice(0, 7)}`);
} else {
  console.log(`[sync-regex] ${changed.length} file(s) updated from poe.re@${commit.slice(0, 7)}:`);
  for (const f of changed) console.log(`  ${f}`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\ncommit=${commit}\n`);
}
