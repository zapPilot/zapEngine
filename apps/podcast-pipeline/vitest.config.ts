import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 98,
        functions: 99,
        branches: 94,
        statements: 98,
      },
      exclude: [
        '**/*.test.ts',
        '**/__fixtures__/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        'src/types.ts',
        'eslint.config.mjs',
        'vitest.config.ts',
      ],
    },
  },
});
