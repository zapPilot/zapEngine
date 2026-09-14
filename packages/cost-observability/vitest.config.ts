import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Specs sit beside the sources they cover and Vitest 4's default
      // `coverage.exclude` is empty, so they have to be named here or `include`
      // would pull them in as untested files.
      exclude: ['src/**/*.test.ts'],
      // Provider defaults, retry/error paths, header parsing, and UTC/pricing
      // seams are exhaustively covered. Keep every dimension pinned at 100%.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
      reportsDirectory: 'coverage',
    },
  },
});
