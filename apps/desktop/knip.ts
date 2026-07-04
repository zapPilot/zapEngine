import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/main/main.ts', 'src/preload/preload.ts'],
  project: ['src/**/*.ts', 'scripts/**/*.mjs'],
  // Workspace packages are imported through package subpath exports and bundled
  // by esbuild; knip cannot map those imports back to the direct dependencies.
  ignoreDependencies: ['@zapengine/app-core', '@zapengine/types', 'viem'],
  vitest: { config: ['vitest.config.ts'], entry: ['tests/**/*.test.ts'] },
});
