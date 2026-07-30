import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    '**/index.ts',
    // Track-record helpers are intentionally kept available for the verification
    // pages/scripts roadmap even though not every helper is wired in the current
    // landing UI yet. Keep the deadcode gate focused on newly introduced drift.
    'src/config/track-record.ts',
    'src/data/track-record-accessor.ts',
  ],
  ignoreDependencies: [
    'postcss',
    'eslint-config-next',
    // Used from src/app/globals.css via @import; Knip does not resolve CSS
    // package imports as dependency usage.
    '@zapengine/design-tokens',
    // The live track-record UI imports the strategy subpath in ten files.
    // Knip does not map that workspace subpath back to the package dependency
    // while the accessor remains roadmap-ignored above.
    '@zapengine/types',
  ],
  // eslint-config-next pulls in @rushstack/eslint-patch, which rejects
  // non-ESLint callers (knip). Skip knip's ESLint plugin to avoid the crash.
  eslint: false,
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  includeEntryExports: true,
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});
