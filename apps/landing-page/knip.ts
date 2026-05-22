import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    '**/index.ts',
    // Reached transitively through src/test-utils/index.ts (ignored barrel)
    // and the source-manifest baseline test.
    'src/test-utils/**',
    // Auto-loaded by vitest's __mocks__ resolution adjacent to vi.mock()
    // calls (see HeroV2.test.tsx). Knip can't trace this convention.
    'src/components/v2/__mocks__/**',
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
