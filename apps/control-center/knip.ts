import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Vite and package scripts expose the other entry points automatically.
  entry: ['src/server/main.ts'],
  project: ['src/**/*.{ts,tsx}'],
  ignoreDependencies: ['@zapengine/cost-observability'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.ts'],
  },
});
