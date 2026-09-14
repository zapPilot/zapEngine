import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'clover', 'json', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', 'src/**/__fixtures__/**'],
      // Ratcheted from the honest 2026-09-14 denominator
      // (83.03/74.30/85.09/83.07) with ~3 points of churn buffer.
      thresholds: {
        branches: 71,
        functions: 82,
        lines: 80,
        statements: 80,
      },
      reportsDirectory: 'coverage',
    },
  },
});
