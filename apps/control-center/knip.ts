import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/**/*.{ts,tsx}'],
  project: ['src/**/*.{ts,tsx}'],
  ignoreDependencies: ['@zapengine/cost-observability'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.ts'],
  },
});
