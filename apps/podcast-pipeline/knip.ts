import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.{ts,tsx}'],
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
