import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'src/app/**/page.tsx',
    'src/app/**/layout.tsx',
    'scripts/**/*.{js,ts}',
  ],
  project: ['src/**/*.{ts,tsx}', 'scripts/**/*.{js,ts}'],
  ignore: ['**/index.ts', 'src/shims/emptyModule.ts'],
  // Pre-flight dependency for rebalance execution; wiring waits on viem client
  // exposure from wallet plumbing and supported-chain alignment.
  ignoreDependencies: [
    '@zapengine/intent-engine',
    '@zapengine/types',
    // Consumed pervasively via subpath imports (@zapengine/app-core/services,
    // /hooks, /providers, …); Knip's workspace resolver does not credit the
    // bare package name for subpath-only usage.
    '@zapengine/app-core',
    // Peer dependency of @zapengine/app-core (its QueryProvider imports it);
    // frontend must provide the single shared instance even though it has no
    // direct import of its own.
    '@tanstack/react-query-devtools',
    'tailwindcss',
    'postcss',
    // Used from src/app/globals.css via @import; Knip does not resolve CSS
    // package imports as dependency usage.
    '@zapengine/design-tokens',
  ],
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  includeEntryExports: true,
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
  playwright: {
    config: ['playwright.config.ts'],
  },
});
