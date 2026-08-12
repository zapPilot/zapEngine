import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Two things knip cannot trace on its own: the package `exports` map targets
  // `dist/`, so it never reaches `src/index.ts`, and `rasterize` is invoked as
  // `node scripts/rasterize.mjs` from a package script. Both must be declared.
  entry: ['src/index.ts', 'scripts/rasterize.mjs'],
  project: ['src/**/*.ts', 'scripts/**/*.mjs'],
  includeEntryExports: false,
});
