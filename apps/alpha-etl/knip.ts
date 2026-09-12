import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['scripts/**/*.ts'],
  project: ['src/**/*.ts', 'scripts/**/*.ts'],
  includeEntryExports: true,
  vitest: { config: ['vitest.config.ts'] },
});
