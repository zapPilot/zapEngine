import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'src/main/entry.ts',
    'src/preload/preload.ts',
    // Run from package.json, never imported. knip does not promote a package.json
    // script reference to an entry point, and `project` below includes
    // scripts/**, so these are reported as unused files — which also made
    // build.mjs's `import esbuild` invisible and esbuild an unused dependency.
    'scripts/build.mjs',
    'scripts/dev.mjs',
  ],
  project: ['src/**/*.ts', 'scripts/**/*.mjs'],
  // Workspace packages are imported through package subpath exports and bundled
  // by esbuild; knip cannot map those imports back to the direct dependencies.
  ignoreDependencies: ['@zapengine/app-core', '@zapengine/types', 'viem'],
  vitest: { config: ['vitest.config.ts'], entry: ['tests/**/*.test.ts'] },
});
