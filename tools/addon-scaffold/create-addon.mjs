import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Generates an ExileCompass addon package matching the current contract:
//   - TypeScript source in src/, bundled by esbuild to dist/panel.js
//   - entry.panel -> ./dist/panel.js (a single ESM module exporting mount(ctx))
//   - a release workflow that builds, packages, and publishes exilecompass-addon.zip
// See the reference addon (exilecompass-addon-example) for the full shape.

function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

async function main() {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const name = positional[0];
  if (!name || flags.help) {
    console.error(
      'Usage: node tools/addon-scaffold/create-addon.mjs "Addon Name" [targetDir] \\\n' +
        '  [--id dev.you.my-addon] [--author "You"] [--homepage https://github.com/you/repo] \\\n' +
        '  [--version 0.1.0] [--description "..."]',
    );
    process.exit(name ? 0 : 1);
  }

  const slug = toSlug(name);
  const id = typeof flags.id === 'string' ? flags.id : `dev.local.${slug}`;
  const author = typeof flags.author === 'string' ? flags.author : 'Your Name';
  const homepage =
    typeof flags.homepage === 'string' ? flags.homepage : 'https://github.com/your-org/your-addon-repo';
  const version = typeof flags.version === 'string' ? flags.version : '0.1.0';
  const description =
    typeof flags.description === 'string' ? flags.description : `${name} addon for ExileCompass.`;
  const targetDir = path.resolve(positional[1] ?? path.join(process.cwd(), `${slug}-addon`));

  const manifest = {
    schemaVersion: '1.0',
    id,
    name,
    description,
    author,
    homepage,
    version,
    kind: 'addon',
    entry: {
      // Bundled output the release pipeline produces; the app runs this file.
      panel: './dist/panel.js',
      data: './data/default.json',
    },
    compatibility: {
      app: '>=0.2.9',
      pluginApi: '^1.2.0',
    },
    // Which games the addon supports; the hub shows this on its card. Trim to
    // ['poe1'] or ['poe2'] for a single-game addon.
    games: ['poe1', 'poe2'],
    permissions: ['storage.read', 'storage.write', 'ui.panel'],
    contributions: {
      'data.providers': [],
      'view.panels': [{ id: slug, title: name, icon: 'panel', pinDefault: false }],
      'settings.sections': [],
      'actions.commands': [],
    },
  };

  const packageJson = {
    name: `@exilecompass/${slug}-addon`,
    version,
    private: true,
    type: 'module',
    scripts: {
      check: 'tsc --noEmit',
      build: 'esbuild src/panel.ts --bundle --format=esm --platform=browser --outfile=dist/panel.js',
    },
    devDependencies: {
      esbuild: '^0.24.0',
      typescript: '^5.6.2',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'Bundler',
      resolveJsonModule: true,
      strict: true,
      noEmit: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  };

  const typesTs = `// The contract the ExileCompass host provides to an addon panel.
// The host runs your bundled panel inside a sandboxed iframe and calls the
// default-exported \`mount(ctx)\` once the panel is shown.

export type AddonGame = 'poe1' | 'poe2';

export interface AddonFetchResponse {
  status: number;
  body: string;
}

export interface AddonRequestOptions {
  url: string;
  /** \`GET\` (default) or \`POST\` — nothing else is permitted. */
  method?: 'GET' | 'POST';
  /** Only \`Accept\` and \`Content-Type\` may be set. The host owns the rest. */
  headers?: Record<string, string>;
  /** Up to 64 KB. */
  body?: string;
}

export interface AddonRequestResponse {
  status: number;
  /**
   * The subset the host lets through: \`x-rate-limit-*\`, \`retry-after\`, and
   * \`content-type\`. Names are lowercase.
   */
  headers: Record<string, string>;
  body: string;
}

export interface PoeApiResponse {
  status: number;
  /** Raw JSON from api.pathofexile.com. */
  body: string;
  /**
   * Set on HTTP 429 — wait this many seconds before any further poe.* call.
   * GGG's rate limits must be respected; ignoring them can get the player's
   * API access restricted.
   */
  retry_after?: number | null;
}

export interface PoeStatus {
  /** The app is signed in to an exilecompass.com account. */
  appLinked: boolean;
  /** That account has a Path of Exile account connected. */
  poeLinked: boolean;
  /** The PoE connection lapsed — reconnect at exilecompass.com/settings. */
  poeExpired: boolean;
  poeName: string | null;
}

export interface AddonHost {
  /**
   * Per-addon key/value storage, persisted by the host and namespaced to this
   * addon. Requires the \`storage.read\` / \`storage.write\` permissions.
   */
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  /**
   * HTTPS GET performed by the host (the sandboxed iframe has an opaque
   * origin, so APIs without CORS headers are unreachable from it). The URL
   * hostname must be covered by a \`network.fetch:<host>\` permission.
   * Absent on ExileCompass versions before 1.4.0.
   */
  net?: {
    fetch(url: string): Promise<AddonFetchResponse>;
    /**
     * Image fetch cached on disk by the host for about a week, returned as a
     * \`data:\` URL — use it for <img> sources, since the sandboxed panel
     * can't use the browser's HTTP cache. Absent before ExileCompass 1.4.1.
     */
    fetchImage?(url: string): Promise<string>;
    /**
     * GET cached on disk by the host for up to \`maxAgeSeconds\` (one day by
     * default, 30 days at most). Use it for large, slow-moving payloads —
     * game data that changes per patch, not per session. Plain \`fetch\`
     * re-downloads every call, and addon storage is the wrong place to park a
     * megabyte: it shares one file with the app's own settings.
     * Absent before ExileCompass 1.5.0.
     */
    fetchCached?(url: string, maxAgeSeconds?: number): Promise<AddonFetchResponse>;
    /**
     * GET or POST performed by the host, returning the allowlisted response
     * headers as well as the body. Needs \`network.request:<host>\`, which is
     * a stronger grant than \`network.fetch:<host>\` and implies it.
     *
     * Use this instead of \`fetch\` when an API rejects GET, or when its
     * rate-limit headers have to be obeyed. Absent before ExileCompass 1.5.0.
     */
    request?(opts: AddonRequestOptions): Promise<AddonRequestResponse>;
  };
  /**
   * Open a URL in the player's default browser. The hostname must be covered
   * by a \`shell.open:<host>\` permission, and only https:// is accepted.
   * Absent on ExileCompass versions before 1.5.0.
   */
  shell?: {
    openExternal(url: string): Promise<void>;
  };
  /**
   * Which game the overlay targets (the footer PoE1/PoE2 switch). Requires
   * \`game.read\`. Absent on ExileCompass versions before 1.4.0.
   */
  game?: {
    get(): Promise<AddonGame>;
    onChange(cb: (game: AddonGame) => void): () => void;
  };
  /**
   * Read-only access to the player's Path of Exile account, performed by the
   * host with the token from the user's linked exilecompass.com account
   * (Settings → Account). The whole namespace requires the \`poe.stashes\`
   * permission — the strongest grant an add-on can request; ask for it only
   * when account data is the point of the add-on. Stash and league endpoints
   * cover PoE1 only until GGG opens the equivalent PoE2 APIs. Absent on
   * ExileCompass versions before 1.5.5.
   */
  poe?: {
    status(): Promise<PoeStatus>;
    /** GET /account/leagues — the account's leagues, raw JSON in \`body\`. */
    leagues(): Promise<PoeApiResponse>;
    /** GET /stash/<league> — stash tab metadata; folders carry children. */
    stashList(league: string): Promise<PoeApiResponse>;
    /** GET /stash/<league>[/<parent>]/<id> — one tab with its items. */
    stashTab(league: string, stashId: string, parentId?: string | null): Promise<PoeApiResponse>;
  };
}

export interface PanelContext {
  /** The root element to render your panel UI into. */
  root: HTMLElement;
  /** The host API bridge (postMessage under the hood). */
  host: AddonHost;
}

export type MountFn = (ctx: PanelContext) => void | Promise<void>;
`;

  const panelTs = `import type { MountFn } from './types';
import defaults from '../data/default.json';

const STORAGE_KEY = 'state';

/**
 * Entry point. The host mounts this into a sandboxed iframe and passes a
 * \`root\` element plus the \`host\` bridge. Runs with no access to the parent
 * app — only the explicit host API.
 */
const mount: MountFn = async ({ root, host }) => {
  const saved = await host.storage.get(STORAGE_KEY);

  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;box-sizing:border-box;';

  const title = document.createElement('p');
  title.textContent = '${name}';
  title.style.cssText = 'margin:0 0 8px;color:#f2dea0;font-weight:600;flex:0 0 auto;';

  const textarea = document.createElement('textarea');
  textarea.value = saved ?? JSON.stringify(defaults, null, 2);
  textarea.spellcheck = false;
  textarea.style.cssText =
    'flex:1 1 auto;width:100%;box-sizing:border-box;min-height:120px;resize:none;padding:8px;' +
    'background:#121214;color:#e8e4de;border:1px solid rgba(184,180,174,0.34);' +
    'font:11px/1.4 "JetBrains Mono",Consolas,monospace;';

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  save.style.cssText =
    'margin-top:8px;flex:0 0 auto;align-self:flex-start;border:1px solid rgba(184,180,174,0.35);' +
    'color:#e8e4de;background:#171719;padding:4px 8px;font-size:11px;cursor:pointer;';
  save.addEventListener('click', () => host.storage.set(STORAGE_KEY, textarea.value));

  root.append(title, textarea, save);
};

export default mount;
`;

  const defaultData = {
    version: 1,
    items: [{ id: 'example', text: 'Replace this with your addon data.' }],
  };

  const gitignore = 'node_modules/\ndist/\n*.zip\n';

  const workflow = `name: Release Addon

# Tagging \`vX.Y.Z\` builds the addon, packages it, and publishes a GitHub
# Release with a fixed-name asset (\`exilecompass-addon.zip\`). ExileCompass
# installs that asset directly from the tag's release.

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v7
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Type check
        run: npm run check

      - name: Verify versions match the tag
        run: |
          TAG="\${GITHUB_REF_NAME#v}"
          MANIFEST=$(jq -r '.version' plugin.manifest.json)
          PKG=$(jq -r '.version' package.json)
          echo "tag=$TAG  manifest=$MANIFEST  package=$PKG"
          if [ "$TAG" != "$MANIFEST" ] || [ "$TAG" != "$PKG" ]; then
            echo "::error::Tag $TAG must match plugin.manifest.json ($MANIFEST) and package.json ($PKG)"
            exit 1
          fi

      - name: Build bundle
        run: npm run build

      - name: Package addon
        run: |
          test -f dist/panel.js || { echo "::error::build did not produce dist/panel.js"; exit 1; }
          zip -r exilecompass-addon.zip plugin.manifest.json README.md dist data

      - name: Create release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \\
            --title "$GITHUB_REF_NAME" \\
            --notes "Automated release for $GITHUB_REF_NAME. Install via the ExileCompass addon registry." \\
            --verify-tag \\
            exilecompass-addon.zip
`;

  const readme = `# ${name}

ExileCompass addon. You author TypeScript in \`src/\`; the release pipeline
bundles it to \`dist/panel.js\` and ships it as \`exilecompass-addon.zip\`.

## Identity

- ID: ${id}
- Version: ${version}
- Author: ${author}

## Develop

1. \`npm install\`
2. \`npm run check\` — type-check
3. \`npm run build\` — bundle to \`dist/panel.js\`

The panel entry (\`src/panel.ts\`) default-exports a \`mount(ctx)\` function. \`ctx.root\`
is where you render; \`ctx.host\` is the permission-gated bridge (e.g.
\`ctx.host.storage\`).

## Publish

1. Set \`homepage\`/\`repoUrl\` to your GitHub repo and bump the version in
   \`plugin.manifest.json\` and \`package.json\` (they must match).
2. Tag \`vX.Y.Z\` and push it — the workflow builds, packages, and releases.
3. Add/update your entry in the ExileCompass registry (\`registry.v1.json\`)
   with \`latestVersion\` and \`repoUrl\`.
`;

  await mkdir(path.join(targetDir, 'src'), { recursive: true });
  await mkdir(path.join(targetDir, 'data'), { recursive: true });
  await mkdir(path.join(targetDir, '.github', 'workflows'), { recursive: true });

  await writeFile(path.join(targetDir, 'plugin.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(targetDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(path.join(targetDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  await writeFile(path.join(targetDir, '.gitignore'), gitignore);
  await writeFile(path.join(targetDir, 'README.md'), readme);
  await writeFile(path.join(targetDir, 'src', 'types.ts'), typesTs);
  await writeFile(path.join(targetDir, 'src', 'panel.ts'), panelTs);
  await writeFile(path.join(targetDir, 'data', 'default.json'), `${JSON.stringify(defaultData, null, 2)}\n`);
  await writeFile(path.join(targetDir, '.github', 'workflows', 'release.yml'), workflow);

  console.log(`Addon scaffold created at ${targetDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
