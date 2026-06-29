import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['tests/**/*.test.ts'],
  project: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
  ignore: [],
  // design-tokens is consumed via a CSS @import in globals.css, and
  // tailwindcss/postcss are wired through postcss.config.mjs + the Tailwind
  // CSS layer — none of which knip traces as a TS dependency import.
  // @zapengine/app-core + @zapengine/types are used only via subpath imports
  // (@zapengine/app-core/services, @zapengine/types/api, …); knip does not
  // credit the bare package name for subpath-only usage. @privy-io/react-auth +
  // react-query-devtools are peer deps app-core's providers require at runtime.
  ignoreDependencies: [
    '@zapengine/design-tokens',
    'tailwindcss',
    'postcss',
    '@zapengine/app-core',
    '@zapengine/types',
    '@privy-io/react-auth',
    '@tanstack/react-query-devtools',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
