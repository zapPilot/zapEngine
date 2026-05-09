import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
      exclude: [
        '**/*.test.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        'src/index.ts',
        'src/types.ts',
        'eslint.config.mjs',
        'vitest.config.ts',
      ],
    },
  },
});
