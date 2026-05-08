// @ts-check
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    'eslint.config.mjs',
    'knip.ts',
    'vitest.config.ts',
  ],
  extraConfigs: [
    {
      rules: {
        '@typescript-eslint/no-unnecessary-condition': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        'no-console': 'off',
        'sonarjs/deprecation': 'off',
      },
    },
    {
      files: ['**/*.test.ts'],
      rules: {
        'sonarjs/no-alphabetical-sort': 'off',
      },
    },
  ],
});
