import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['examples/basic-usage.ts', 'src/index.ts'],
  project: ['src/**/*.ts', 'test/**/*.ts', 'examples/**/*.ts'],
  ignoreDependencies: ['@zapengine/types'],
  vitest: {
    entry: ['test/**/*.{test,spec}.ts'],
  },
});
