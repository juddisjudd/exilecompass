// Refreshes the bundled crafting-guides fallback snapshot from the published CDN
// copy. The overlay ships this snapshot so the Craft tab works on first run /
// offline; at runtime it fetches the live guides.json and prefers that.
//
// Run before cutting a release: `bun run sync-guides`. (Guides themselves are
// authored + published from the exilecompass-guides repo — not here.)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src', 'lib', 'guides.fallback.json');
const URL_ = process.env.GUIDES_URL || 'https://guides.exilecompass.com/guides.json';

const res = await fetch(URL_, { cache: 'no-cache' });
if (!res.ok) {
  console.error(`[sync-guides] fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const data = await res.json();
if (!Array.isArray(data) || data.length === 0) {
  console.error('[sync-guides] CDN returned an empty or invalid guides.json — keeping current snapshot.');
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(data) + '\n');
console.log(`[sync-guides] Updated fallback snapshot: ${data.length} guide(s) → src/lib/guides.fallback.json`);
