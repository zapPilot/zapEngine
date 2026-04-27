// @ts-check
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
  ],
  extraConfigs: [
    {
      files: ['tsconfig*.json'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
});