import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
  project: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
  ignoreDependencies: ['@zapengine/cost-observability'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.ts'],
  },
});
