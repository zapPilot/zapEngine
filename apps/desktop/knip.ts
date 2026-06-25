import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/main.tsx', 'tests/**/*.test.ts'],
  project: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
  ignore: ['vite-env.d.ts'],
  // design-tokens is consumed via a CSS @import in globals.css, and
  // tailwindcss/postcss are wired through postcss.config.mjs + the Tailwind
  // CSS layer — none of which knip traces as a TS dependency import.
  // @zapengine/app-core is used only via subpath imports (knip does not credit
  // the bare package name); @privy-io/react-auth + react-query-devtools are
  // peer dependencies that app-core's providers require at runtime.
  ignoreDependencies: [
    '@zapengine/design-tokens',
    'tailwindcss',
    'postcss',
    '@zapengine/app-core',
    '@privy-io/react-auth',
    '@tanstack/react-query-devtools',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
