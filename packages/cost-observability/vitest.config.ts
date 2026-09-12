import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      // Set at the measured baseline (94.53/78.81/86.2/95.16); raise only
      // after sustained coverage improvements.
      thresholds: {
        branches: 78,
        functions: 86,
        lines: 95,
        statements: 94,
      },
      reportsDirectory: 'coverage',
    },
  },
});
