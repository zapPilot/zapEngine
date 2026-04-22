import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'src/app/**/page.tsx',
    'src/app/**/layout.tsx',
    'scripts/**/*.{js,ts}',
  ],
  project: ['src/**/*.{ts,tsx}', 'scripts/**/*.{js,ts}'],
  ignore: ['**/index.ts', 'src/shims/emptyModule.ts'],
  ignoreDependencies: ['@zapengine/types', 'tailwindcss', 'postcss'],
  ignoreIssues: {
    'src/lib/errors/ServiceError.ts': ['exports'],
  },
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
