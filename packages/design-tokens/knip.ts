import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Package exports and codegen scripts are discovered automatically. Do not
  // make every source file an entry; that would hide orphaned implementation.
  project: ['src/**/*.ts'],
  includeEntryExports: false,
});
