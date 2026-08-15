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
    'src/social/cli.ts',
    'src/social/login.ts',
    'src/services/video/cli.ts',
    'src/services/video/r2-playback-canary.ts',
    'src/services/video/storyboard/smoke-cli.ts',
  ],
  ignoreDependencies: [
    // Pre-existing: loaded via CSS @import; knip only resolves JS imports
    '@zapengine/design-tokens',
  ],
  vitest: { config: ['vitest.config.ts'], entry: ['src/**/*.test.ts'] },
});
