import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    '**/index.ts',
    // Reached transitively through src/test-utils/index.ts (ignored barrel).
    'src/test-utils/**',
    // Auto-loaded by vitest's __mocks__ resolution adjacent to vi.mock()
    // calls (see Hero.test.tsx). Knip can't trace this convention.
    'src/components/landing/__mocks__/**',
  ],
  ignoreExports: [
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
