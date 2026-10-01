import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // No `entry`: knip derives the subpath barrels (., ./api, ./etl,
    // ./strategy, ./shared) from the package.json `exports` map (dist paths
    // mapped back to src through tsconfig outDir/rootDir), and redeclaring them
    // is reported as a redundant entry pattern. Their entry status is what
    // keeps the public wire-contract types from looking unused: deadcode runs
    // in this package alone, so sibling-workspace consumers are invisible.
    project: ['src/**/*.ts'],
    includeEntryExports: false,
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
