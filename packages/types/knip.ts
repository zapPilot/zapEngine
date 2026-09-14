import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // Subpath barrels mirror package.json exports (., ./api, ./etl,
    // ./strategy, ./shared). knip runs per-workspace and cannot discover
    // sibling-workspace consumers, so these barrels must be explicit entries —
    // otherwise public wire-contract types look unused.
    entry: [
      'src/index.ts',
      'src/api/index.ts',
      'src/etl/index.ts',
      'src/strategy/index.ts',
      'src/shared/index.ts',
    ],
    project: ['src/**/*.ts'],
    includeEntryExports: false,
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
