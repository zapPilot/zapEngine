import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // Only the root knip cannot derive: the Remotion CLI receives the entry
    // as an argument (`remotion studio src/index.ts`). The scripts/ CLIs are
    // reached through package.json (`tsx scripts/…`). Keep this narrower than
    // `project`, or knip can never report an unused file or export.
    entry: ['src/index.ts'],
    project: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    // Imported through its dist-backed `./tokens` subpath export, which knip
    // cannot attribute back to the workspace dependency.
    ignoreDependencies: ['@zapengine/design-tokens'],
    vitest: {
      config: ['vitest.config.ts'],
      entry: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
  },
  // This workspace does not depend on @zapengine/types.
  { omitDefaultIgnoreDependencies: ['@zapengine/types'] },
);
