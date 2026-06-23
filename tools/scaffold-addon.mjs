#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function requireString(args, key) {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value.trim();
}

function writeFileSafe(filePath, content) {
  if (fs.existsSync(filePath)) {
    throw new Error(`Refusing to overwrite existing file: ${filePath}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function printHelp() {
  console.log(`\nExileCompass Addon Scaffold\n\nUsage:\n  node tools/scaffold-addon.mjs \\\n    --id dev.example.my-addon \\\n    --name "My Addon" \\\n    --author "Your Name" \\\n    --homepage "https://github.com/org/repo" \\\n    [--description "Addon description"] \\\n    [--version 0.1.0] \\\n    [--dir C:/Repos/poe2/my-addon]\n\nDefaults:\n  --description  "Generated addon scaffold"\n  --version      "0.1.0"\n  --dir          "../<id-with-dots-replaced-by-dashes>"\n\nExample:\n  bun run addon:scaffold --id dev.local.my-addon --name "My Addon" --author "Me" --homepage "https://github.com/me/my-addon"\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }

  const id = requireString(args, 'id');
  const name = requireString(args, 'name');
  const author = requireString(args, 'author');
  const homepage = requireString(args, 'homepage');
  const description = typeof args.description === 'string' ? args.description.trim() : 'Generated addon scaffold';
  const version = typeof args.version === 'string' ? args.version.trim() : '0.1.0';

  const cwd = process.cwd();
  const defaultDirName = id.replace(/\./g, '-');
  const addonDir = typeof args.dir === 'string'
    ? path.resolve(cwd, args.dir)
    : path.resolve(cwd, '..', defaultDirName);

  if (fs.existsSync(addonDir)) {
    throw new Error(`Target directory already exists: ${addonDir}`);
  }

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
      main: './src/main.ts',
      panel: './src/panel.ts',
      data: './data/default.json',
    },
    compatibility: {
      app: '>=0.2.9 <0.4.0',
      pluginApi: '^1.0.0',
    },
    permissions: ['storage.read', 'storage.write', 'ui.panel'],
    contributions: {
      'data.providers': [
        {
          type: 'addon.seed',
          source: './data/default.json',
          label: 'Default data',
        },
      ],
      'view.panels': [
        {
          id: 'main',
          title: name,
          icon: 'panel',
          pinDefault: false,
        },
      ],
      'settings.sections': [
        {
          id: 'main',
          title: `${name} Settings`,
          order: 50,
        },
      ],
      'actions.commands': [
        {
          id: 'open-panel',
          title: 'Open Panel',
          description: `Open ${name} panel.`,
        },
      ],
    },
  };

  const readme = `# ${name}\n\nGenerated addon scaffold for ExileCompass.\n\n## Identity\n\n- ID: ${id}\n- Version: ${version}\n- Author: ${author}\n\n## Structure\n\n- plugin.manifest.json\n- src/main.ts\n- src/panel.ts\n- src/types.ts\n- data/default.json\n\n## Validate\n\nRun:\n\n- npm install\n- npm run check\n`;

  const packageJson = {
    name: `@exilecompass/${id.replace(/\./g, '-')}`,
    version,
    private: true,
    type: 'module',
    scripts: {
      check: 'tsc --noEmit',
    },
    devDependencies: {
      typescript: '^5.6.2',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  };

  const typesTs = `export interface AddonPanelDescriptor {\n  id: string;\n  title: string;\n  description: string;\n}\n\nexport interface AddonModule {\n  id: string;\n  version: string;\n  panel: AddonPanelDescriptor;\n  dataPath: string;\n}\n`;

  const panelTs = `import type { AddonPanelDescriptor } from './types';\n\nexport const panelDescriptor: AddonPanelDescriptor = {\n  id: 'main',\n  title: '${name}',\n  description: '${description.replace(/'/g, "\\'")}',\n};\n`;

  const mainTs = `import { panelDescriptor } from './panel';\nimport type { AddonModule } from './types';\n\nexport const addonModule: AddonModule = {\n  id: '${id}',\n  version: '${version}',\n  panel: panelDescriptor,\n  dataPath: './data/default.json',\n};\n\nexport default addonModule;\n`;

  const defaultData = {
    version: 1,
    items: [
      {
        id: 'example-item-1',
        text: 'Replace this with your addon data.',
      },
    ],
  };

  writeFileSafe(path.join(addonDir, 'plugin.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSafe(path.join(addonDir, 'README.md'), readme);
  writeFileSafe(path.join(addonDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSafe(path.join(addonDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  writeFileSafe(path.join(addonDir, 'src', 'types.ts'), typesTs);
  writeFileSafe(path.join(addonDir, 'src', 'panel.ts'), panelTs);
  writeFileSafe(path.join(addonDir, 'src', 'main.ts'), mainTs);
  writeFileSafe(path.join(addonDir, 'data', 'default.json'), `${JSON.stringify(defaultData, null, 2)}\n`);

  console.log(`Scaffold created at ${addonDir}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Addon scaffold failed: ${message}`);
  process.exit(1);
}
