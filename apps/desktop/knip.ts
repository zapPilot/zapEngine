import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'src/main/main.ts',
    'src/preload/preload.ts',
    'scripts/build.mjs',
    'scripts/dev.mjs',
  ],
  project: ['src/**/*.ts', 'scripts/**/*.mjs'],
  // electron-builder is invoked via its CLI in the package script;
  // electron is the runtime host binary (dev.mjs spawns it).
  ignoreDependencies: ['electron-builder'],
  vitest: { config: ['vitest.config.ts'], entry: ['tests/**/*.test.ts'] },
});
