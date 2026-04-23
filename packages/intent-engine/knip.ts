import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['examples/basic-usage.ts'],
  project: ['src/**/*.ts', 'test/**/*.ts', 'examples/**/*.ts'],
  // Pre-flight dependency for bucket-level strategy contracts; resolver wiring
  // will consume it in the next feature phase.
  ignoreDependencies: ['@zapengine/types'],
  vitest: {
    entry: ['test/**/*.{test,spec}.ts'],
  },
});
