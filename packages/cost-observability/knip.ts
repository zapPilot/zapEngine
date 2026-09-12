import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    entry: ['src/index.ts'],
    project: ['src/**/*.ts'],
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
