# Addon Scaffold Generator

Generates a ready-to-build, ready-to-release ExileCompass addon.

```bash
bun run addon:scaffold "My Addon"
# or
node tools/addon-scaffold/create-addon.mjs "My Addon" [targetDir] \
  --id dev.you.my-addon \
  --author "You" \
  --homepage https://github.com/you/my-addon \
  [--version 0.1.0] [--description "..."]
```

It creates a TypeScript-first package matching the current addon contract:

- `plugin.manifest.json` — `entry.panel` → `./dist/panel.js`
- `package.json` — `check` (tsc) + `build` (esbuild bundle) scripts
- `tsconfig.json`
- `src/types.ts` — the host contract (`PanelContext`, `MountFn`)
- `src/panel.ts` — default-exports `mount(ctx)` (the starter panel)
- `data/default.json`
- `.gitignore` (ignores `node_modules/`, `dist/`, `*.zip`)
- `.github/workflows/release.yml` — on a `vX.Y.Z` tag: type-check, version-match
  guard, esbuild bundle, package, and publish `exilecompass-addon.zip`

After generating: set `homepage`/`repoUrl` to your repo, then `npm install` and
`npm run build`. Tag `vX.Y.Z` to publish, and add the addon to the registry's
`registry.v1.json`. See `exilecompass-addon-example` for a complete reference.
