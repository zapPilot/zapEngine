import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // The package `exports` map resolves `./dist/index.js` back to
    // `src/index.ts` on its own; declaring it explicitly only produced a
    // redundant-entry hint. Nothing is declared here.
    project: ['src/**/*.ts'],
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
