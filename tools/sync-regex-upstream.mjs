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

// Relic is the one dataset the app imports as a module instead of fetching, so
// poe.re's JSON is emitted back out as the TS module it used to ship.
function relicModule(text) {
  const entries = JSON.parse(text).map(
    (e) => `{
  name: ${JSON.stringify(e.name)},
  regex: ${JSON.stringify(e.regex)},
  values: ${JSON.stringify(e.values)},
  ranges: ${JSON.stringify(e.ranges)},
  affix: ${JSON.stringify(e.affix)},
}`,
  );
  return `export interface RelicRegex {
  name: string,
  regex: string,
  values: number[],
  ranges: number[][],
  affix: string,
}
export const relicRegex: RelicRegex[] = [
${entries.join(', \n')}]`;
}

// Upstream path (relative to the poe.re checkout) → local path. Only what the
// app actually consumes; poe.re's other languages, trade ids and UI stay there.
// An optional `transform` rewrites the text before it lands locally.
//
// Always the unminified `*/generated/` trees, never the `*/public/generated/`
// ones poe.re's own site fetches: since veiset/poe.re#510 the minified copies
// re-escape backslashes (`\\d+` where the source has `\d+`), which would ship
// a broken stash search for every token carrying one.
const POE1_DATA = [
  'item/Generated.Item.json',
  'item/Generated.Basetypes.Item.json',
  'beast/Generated.BeastRegex.json',
  'boatmods/Generated.BoatMods.ENGLISH.json',
  'expedition/Generated.Expedition.json',
  'jewel/Generated.Jewel.json',
  'mapmods/Generated.Map.ENGLISH.json',
  'scarabs/Generated.Scarabs.json',
  'gems/Generated.Gems.ENGLISH.json',
];
// What poe.re still authors as TS modules. It converts these to JSON one PR
// at a time (#505/#508, then gems in #507), so expect each to move in turn.
const POE1_MODULES = [
  'GeneratedTattoo.ts',
  'GeneratedRunegraft.ts',
  'GeneratedHeist.ts',
  'GeneratedFlaskMods.ts',
];
const FILES = {
  ...Object.fromEntries(
    POE1_DATA.map((f) => [
      `poe/generated/${f}`,
      // Only the item mods are big enough (11 MB pretty-printed) to be worth
      // minifying; the rest land exactly as upstream ships them.
      { to: `${POE1_SRC}/generated/${f}`, transform: f === 'item/Generated.Item.json' ? minify : undefined },
    ]),
  ),
  ...Object.fromEntries(POE1_MODULES.map((f) => [`poe/src/generated/${f}`, { to: `${POE1_SRC}/src/generated/${f}` }])),
  'poe2/generated/waystone/Generated.Waystone.json': { to: 'static/generated/Generated.Waystone.min.json', transform: minify },
  'poe2/generated/tablet/Generated.Tablet.json': { to: 'static/generated/Generated.Tablet.min.json', transform: minify },
  'poe2/generated/item/Generated.Item.json': { to: 'static/generated/Generated.Item.min.json', transform: minify },
  'poe2/generated/item/Generated.Basetypes.Item.json': { to: 'static/generated/Generated.Basetypes.Item.min.json', transform: minify },
  'poe2/generated/relic/Generated.Relic.json': { to: 'src/lib/regex/relicData.ts', transform: relicModule },
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
      every(e.categoryRegex, 0, (c) => typeof c.category === 'string' && every(c.modifiers, 0, (m) => typeof m.regex === 'string' && Array.isArray(m.stats) && Array.isArray(m.on))),
    );
    if (!ok) die(`${local}: unexpected shape (basetype + categoryRegex[].modifiers[])`);
  } else if (name === 'Generated.Basetypes.Item.min.json') {
    if (!every(JSON.parse(text), 30, (e) => typeof e.name === 'string' && Array.isArray(e.items))) die(`${local}: unexpected shape (name + items[])`);
  } else if (name === 'relicData.ts') {
    const entries = (text.match(/^\s*regex: "/gm) ?? []).length;
    if (!text.includes('export const relicRegex') || entries < 20) die(`${local}: unexpected shape (relicRegex with ${entries} entries)`);
  }
}

const GENERATED_DIRS = ['poe/generated', 'poe/src/generated', 'poe2/generated', 'shared/generated'];

// What poe.re added, renamed or deleted under its generated trees since the
// commit last synced — the answer to "where did that file go". CI's shallow
// checkout won't have that commit, so fetch just that one before diffing.
function upstreamLayoutChanges(since) {
  if (!since) return null;
  const diff = () => git('diff', '--name-status', '-M', `${since}..HEAD`, '--', ...GENERATED_DIRS);
  let out;
  try {
    out = diff();
  } catch {
    try {
      if (git('rev-parse', '--is-shallow-repository') !== 'true') return null;
      git('fetch', '--depth=1', 'origin', since);
      out = diff();
    } catch {
      return null;
    }
  }
  return out.split('\n').filter((l) => l && !l.startsWith('M'));
}

if (!existsSync(upstream)) die(`upstream checkout not found at ${upstream} (pass --upstream <dir>)`);
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;

const missing = Object.keys(FILES).filter((rel) => !existsSync(join(upstream, rel)));
if (missing.length > 0) {
  const pinned = lock?.commit?.slice(0, 7);
  const lines = ['missing in upstream — poe.re moved, renamed or removed:', ...missing.map((f) => `  ${f}`)];
  const moves = upstreamLayoutChanges(lock?.commit);
  if (moves?.length) {
    lines.push(`added/renamed/deleted under its generated trees since the pinned ${pinned}:`, ...moves.map((l) => `  ${l.replace(/\t/g, '  ')}`));
  } else if (moves) {
    lines.push(`nothing else moved under its generated trees since the pinned ${pinned}.`);
  }
  lines.push('update FILES in tools/sync-regex-upstream.mjs (and its reader in tools/build-poe1-regex-data.mjs), or drop the category if poe.re dropped the dataset.');
  die(lines.join('\n'));
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
