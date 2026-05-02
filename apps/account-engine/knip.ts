import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  ignore: [
    '**/*.spec.ts',
    '**/*.e2e-spec.ts',
    'test/**',
    'scripts/**',
    'src/test-utils/**',
    'vitest.setup.ts',
    'nest-cli.json',
    'src/types/database.types.ts',
  ],
  ignoreDependencies: ['@zapengine/types'],
  includeEntryExports: true,
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['test/unit/**/*.spec.ts', 'test/e2e/**/*.e2e-spec.ts'],
  },
});
