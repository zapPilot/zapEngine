import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/main.tsx', 'tests/**/*.test.ts'],
  project: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
  ignore: ['vite-env.d.ts'],
  // design-tokens is consumed via a CSS @import in globals.css, which knip
  // cannot trace through; keep it from being reported as an unused dependency.
  ignoreDependencies: ['@zapengine/design-tokens'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
