import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
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
