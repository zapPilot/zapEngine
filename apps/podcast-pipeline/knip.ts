import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.{ts,tsx}'],
  // Everything reached only by being executed, never by being imported: two Fly
  // process-group commands (index/worker) and the package.json CLI scripts.
  // Declaring them explicitly means reachability stops depending on whether a
  // co-located test happens to exist.
  entry: [
    'src/index.ts',
    'src/worker.ts',
    'src/services/video/cli.ts',
    'src/services/video/r2-playback-canary.ts',
    'src/services/video/storyboard/smoke-cli.ts',
  ],
  ignore: [
    // Pre-existing: exported for future use; not yet consumed in the workspace
    'src/services/video/audio-analysis.ts',
    // Pre-existing: types and constants used via barrel re-exports and schema
    // composition; knip can't trace these patterns
    'src/services/video/manifest.ts',
  ],
  ignoreDependencies: [
    // Pre-existing: loaded via CSS @import; knip only resolves JS imports
    '@zapengine/design-tokens',
  ],
  vitest: { config: ['vitest.config.ts'], entry: ['src/**/*.test.ts'] },
});
