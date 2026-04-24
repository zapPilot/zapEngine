import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: ['**/index.ts'],
  ignoreDependencies: ['postcss', 'eslint-config-next'],
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
