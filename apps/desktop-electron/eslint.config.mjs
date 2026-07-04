// @ts-check
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'dist/**',
    'release/**',
    'node_modules/**',
    'coverage/**',
    'eslint.config.mjs',
    'knip.ts',
    'vitest.config.ts',
  ],
});
