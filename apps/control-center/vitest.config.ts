import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'clover', 'json', 'lcov'],
      // Initial contract floors from the measured 2026-08-26 baseline:
      // 51.58/40.97/50.00/52.15. Ratchet upward with sustained coverage.
      thresholds: {
        branches: 40,
        functions: 50,
        lines: 52,
        statements: 51,
      },
      reportsDirectory: 'coverage',
    },
  },
});
