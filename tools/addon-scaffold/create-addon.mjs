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
      pluginApi: '^1.0.0',
    },
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

export interface AddonHost {
  /**
   * Per-addon key/value storage, persisted by the host and namespaced to this
   * addon. Requires the \`storage.read\` / \`storage.write\` permissions.
   */
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
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
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
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
