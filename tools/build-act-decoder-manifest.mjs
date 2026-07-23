// Groups the bundled Act-Decoder zone layout images (static/act-decoder/poe1/)
// by PoE internal area id into a lookup manifest the frontend can fetch
// cheaply instead of listing a directory at runtime.
//
// Filenames follow Exile-UI's own convention: "<areaId> <variant>.jpg", where
// variant is a number ("1", "2", ...), a number with a sub-variant
// ("6_2"), or a special marker ("x"/"y") for an excluded/generic layout.
// The area id and variant are split on the LAST space in the filename.
//
// Re-run after adding/removing images in that folder: `bun run build:act-decoder-manifest`.

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IMAGES_DIR = join(ROOT, 'static', 'act-decoder', 'poe1');
const OUT = join(ROOT, 'src', 'lib', 'data', 'actDecoderManifest.poe1.json');

const files = readdirSync(IMAGES_DIR).filter((f) => f.toLowerCase().endsWith('.jpg'));

/** @type {Record<string, string[]>} */
const manifest = {};

for (const file of files) {
  const stem = file.slice(0, -4); // strip ".jpg"
  const lastSpace = stem.lastIndexOf(' ');
  if (lastSpace < 0) {
    console.warn(`[act-decoder-manifest] skipping unexpected filename: ${file}`);
    continue;
  }
  const areaId = stem.slice(0, lastSpace);
  (manifest[areaId] ??= []).push(file);
}

for (const variants of Object.values(manifest)) variants.sort();

writeFileSync(OUT, JSON.stringify(manifest) + '\n');
console.log(
  `[act-decoder-manifest] ${Object.keys(manifest).length} zone(s), ${files.length} image(s) → ` +
    'src/lib/data/actDecoderManifest.poe1.json',
);
