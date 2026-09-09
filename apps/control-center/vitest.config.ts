import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'clover', 'json', 'lcov'],
      // Ratcheted from the 2026-09-08 measured baseline
      // (81.84/70.36/82.05/82.06) with ~4 points of churn buffer.
      thresholds: {
        branches: 66,
        functions: 78,
        lines: 78,
        statements: 77,
      },
      reportsDirectory: 'coverage',
    },
  },
});