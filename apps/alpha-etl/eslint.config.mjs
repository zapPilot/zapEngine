// @ts-check
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    '**/*.js',
    'tests/**',
    'vitest.config.ts',
  ],
  extraConfigs: [
    {
      rules: {
        // Keep alpha-etl's stricter unused var handling.
        '@typescript-eslint/no-unused-vars': 'error',
        // Keep this preset migration focused on shared backend wiring.
        '@typescript-eslint/no-base-to-string': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        'sonarjs/cors': 'off',
        'sonarjs/deprecation': 'off',
        'sonarjs/different-types-comparison': 'off',
        'sonarjs/no-alphabetical-sort': 'off',
        'sonarjs/no-nested-template-literals': 'off',
        'sonarjs/pseudo-random': 'off',
      },
    },
    {
      files: ['scripts/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
});
