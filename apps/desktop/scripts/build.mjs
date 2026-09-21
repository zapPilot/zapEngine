#!/usr/bin/env node
// esbuild-bundles the Electron main + preload into self-contained CJS files.
// Bundling @zapengine/app-core dist + viem into the output sidesteps two
// packaging traps: Electron main loading workspace ESM dist, and
// electron-builder walking pnpm-symlinked node_modules into the asar.
import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

const bakedDsn = process.env['SENTRY_DESKTOP_DSN']?.trim() ?? '';
const bakedRelease = process.env['APP_COMMIT_SHA']?.trim() ?? '';

await build({
  ...shared,
  entryPoints: ['src/main/entry.ts'],
  outfile: 'dist/main/main.cjs',
  define: {
    __SENTRY_DESKTOP_DSN__: JSON.stringify(bakedDsn),
    __SENTRY_DESKTOP_RELEASE__: JSON.stringify(bakedRelease),
  },
});

await build({
  ...shared,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'dist/preload/preload.cjs',
});
