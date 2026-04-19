import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  ignore: [
    '**/*.spec.ts',
    '**/*.e2e-spec.ts',
    'test/**',
    'scripts/**',
    'src/test-utils/**',
    'jest.setup.ts',
    'nest-cli.json',
    'src/types/database.types.ts',
  ],
  ignoreDependencies: ['@zapengine/types', 'tsconfig-paths'],
  includeEntryExports: true,
  jest: {
    config: ['test/jest-e2e.json'],
    entry: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
});
