import { defineKnipConfig } from '@zapengine/knip-config/base';

const config = defineKnipConfig(
  {
    // Only the root knip cannot derive: the Remotion CLI receives the entry
    // as an argument (`remotion studio src/index.ts`). The scripts/ CLIs are
    // reached through package.json (`tsx scripts/…`). Keep this narrower than
    // `project`, or knip can never report an unused file or export.
    entry: ['src/index.ts'],
    project: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    // Imports resolve through dist-backed workspace exports; Knip cannot
    // attribute them back to the direct dependencies (render.ts/loop.ts use
    // media-release; brand imports design-tokens/tokens).
    ignoreDependencies: [
      '@zapengine/design-tokens',
      '@zapengine/media-release',
      '@zapengine/kokode-story',
    ],
    vitest: {
      config: ['vitest.config.ts'],
      entry: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
  },
  // This workspace does not depend on @zapengine/types.
  { omitDefaultIgnoreDependencies: ['@zapengine/types'] },
);

// Run from the monorepo root so workspace symlinks remain dependencies in the graph.
const { entry, project, eslint, vitest, ...global } = config;
const workspaceConfig = {
  ...global,
  // Excluded workspaces must not execute their ESLint plugins. The selected
  // workspace keeps its original plugin setting below.
  eslint: false,
  workspaces: {
    'apps/video': { entry, project, eslint, vitest },
  },
};

export default workspaceConfig;
