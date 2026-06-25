import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/main.tsx', 'tests/**/*.test.ts'],
  project: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
  ignore: ['vite-env.d.ts'],
  // design-tokens is consumed via a CSS @import in globals.css, and
  // tailwindcss/postcss are wired through postcss.config.mjs + the Tailwind
  // CSS layer — none of which knip traces as a TS dependency import.
  ignoreDependencies: ['@zapengine/design-tokens', 'tailwindcss', 'postcss'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
