import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    // Package exports and codegen scripts are discovered automatically. Do not
    // make every source file an entry; that would hide orphaned implementation.
    project: ['src/**/*.ts'],
    // uv is the external Python toolchain for reproducible OFL instances, not an npm binary.
    ignoreBinaries: ['uv'],
    includeEntryExports: false,
  },
  {
    // This package does not depend on @zapengine/types, so the shared base
    // suppression for it would be a dead ignore here.
    omitDefaultIgnoreDependencies: ['@zapengine/types'],
  },
);
