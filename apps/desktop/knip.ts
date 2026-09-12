import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/main/entry.ts', 'src/preload/preload.ts'],
  project: ['src/**/*.ts', 'scripts/**/*.mjs'],
  // scripts/build.mjs and scripts/dev.mjs are never imported; knip promotes
  // them to entry points from the `build` and `dev` package.json scripts, and
  // that is what keeps build.mjs's `import esbuild` visible.
  //
  // app-core is imported through package subpath exports and bundled by
  // esbuild; knip cannot map those imports back to the direct dependency.
  ignoreDependencies: ['@zapengine/app-core', 'viem'],
  vitest: { config: ['vitest.config.ts'] },
});
