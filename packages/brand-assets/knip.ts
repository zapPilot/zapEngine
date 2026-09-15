import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // knip promotes the `exports`-mapped entry on its own: the package
    // `exports` map resolves `./dist/index.js` back to `src/index.ts`.
    // `rasterize` is only ever run by hand (`pnpm rasterize`), so it needs an
    // explicit entry to stay reachable.
    entry: ['scripts/rasterize.mjs'],
    project: ['src/**/*.ts', 'scripts/**/*.mjs'],
    includeEntryExports: false,
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
