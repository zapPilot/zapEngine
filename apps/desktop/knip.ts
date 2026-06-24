import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['tests/**/*.test.ts'],
  project: ['tests/**/*.ts'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
