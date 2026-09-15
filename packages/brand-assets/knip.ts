import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // knip promotes both entry points on its own: the package `exports` map
    // resolves `./dist/index.js` back to `src/index.ts`, and `rasterize` is
    // invoked as `node scripts/rasterize.mjs` from a package script. Nothing
    // is declared here so a stale explicit pattern cannot mask drift.
    project: ['src/**/*.ts', 'scripts/**/*.mjs'],
    includeEntryExports: false,
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
