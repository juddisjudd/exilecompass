#!/usr/bin/env node
/**
 * One-command release: bump the version everywhere, commit, tag, and push.
 *
 *   bun run release:tag patch        # 0.1.0 -> 0.1.1
 *   bun run release:tag minor        # 0.1.0 -> 0.2.0
 *   bun run release:tag major        # 0.1.0 -> 1.0.0
 *   bun run release:tag 0.4.2        # explicit version
 *   bun run release:tag patch --no-push   # bump + commit + tag locally, don't push
 *
 * Pushing the tag triggers .github/workflows/release.yml, which builds, signs,
 * and publishes the GitHub release (+ latest.json for the in-app updater).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(root, 'package.json');
const CONF = join(root, 'src-tauri/tauri.conf.json');
const CARGO = join(root, 'src-tauri/Cargo.toml');
const LOCK = join(root, 'src-tauri/Cargo.lock');

const args = process.argv.slice(2);
const noPush = args.includes('--no-push');
const bump = args.find((a) => !a.startsWith('--'));

function die(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

if (!bump) {
  die('Usage: bun run release:tag <patch|minor|major|x.y.z> [--no-push]');
}

// Run git with an argument array (no shell → no injection risk).
// Returns trimmed stdout, or '' when output is inherited (stdio: 'inherit').
function git(argv, opts = {}) {
  const out = execFileSync('git', argv, { cwd: root, stdio: 'pipe', ...opts });
  return out ? out.toString().trim() : '';
}

// ── Compute the next version ────────────────────────────────────────────────
const pkgRaw = readFileSync(PKG, 'utf8');
const current = JSON.parse(pkgRaw).version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) die(`Current version "${current}" is not x.y.z`);
let [maj, min, pat] = m.slice(1).map(Number);

let next;
if (bump === 'patch') next = `${maj}.${min}.${pat + 1}`;
else if (bump === 'minor') next = `${maj}.${min + 1}.0`;
else if (bump === 'major') next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(bump)) next = bump;
else die(`Invalid version "${bump}". Use patch|minor|major or x.y.z`);

const tag = `v${next}`;

// ── Safety checks ────────────────────────────────────────────────────────────
if (git(['status', '--porcelain'])) {
  die('Working tree is not clean — commit or stash your changes first.');
}
if (git(['tag', '--list']).split('\n').includes(tag)) {
  die(`Tag ${tag} already exists.`);
}

console.log(`\x1b[36mReleasing ${current} → ${next}  (${tag})\x1b[0m`);

// ── Bump versions (targeted replacements keep diffs minimal) ─────────────────
// A replace that matches nothing returns the string unchanged and reports it to
// nobody — which is how v1.5.0 shipped with a stale Cargo.lock. So every bump
// asserts its pattern matched first. (Matching, not changing: re-tagging the
// current version legitimately rewrites nothing, per the commit step below.)
function bumpFile(path, label, pattern, replacement) {
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) die(`${label}: found no version to bump — has the file's shape changed?`);
  writeFileSync(path, before.replace(pattern, replacement));
}

// package.json / tauri.conf.json — only the top-level "version"
bumpFile(PKG, 'package.json', /"version":\s*"[^"]+"/, `"version": "${next}"`);
bumpFile(CONF, 'tauri.conf.json', /"version":\s*"[^"]+"/, `"version": "${next}"`);

// Cargo.toml — the [package] version (first version after the [package] header)
bumpFile(CARGO, 'Cargo.toml', /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/, `$1${next}$2`);

// Cargo.lock — the exilecompass package entry, so the lock stays in sync.
// `\r?\n` because git checks this file out CRLF under core.autocrlf while cargo
// rewrites it LF, so which one is on disk depends on who touched it last.
bumpFile(LOCK, 'Cargo.lock', /(name = "exilecompass"\r?\nversion = ")[^"]+(")/, `$1${next}$2`);

// ── Commit, tag, push ────────────────────────────────────────────────────────
git(['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']);
// Releasing the current version (e.g. the very first release) writes no changes —
// only commit when the version actually moved.
let staged = true;
try { git(['diff', '--cached', '--quiet']); staged = false; } catch { staged = true; }
if (staged) {
  git(['commit', '-m', `Release ${tag}`]);
  console.log(`\x1b[32m✓ committed version bump\x1b[0m`);
} else {
  console.log(`\x1b[36mVersion already ${next} — tagging current commit.\x1b[0m`);
}
git(['tag', '-a', tag, '-m', `Release ${tag}`]);
console.log(`\x1b[32m✓ tagged ${tag}\x1b[0m`);

if (noPush) {
  console.log(`\nLocal only. To publish:\n  git push origin HEAD ${tag}`);
} else {
  console.log('Pushing…');
  // Push the branch and the tag explicitly. (Pushing the tag by name is more
  // reliable than --follow-tags, which skips tags when the branch is unchanged.)
  git(['push', 'origin', 'HEAD', tag], { stdio: 'inherit' });
  console.log(`\n\x1b[32m✓ pushed ${tag}\x1b[0m — the release workflow will build and publish.`);
}
