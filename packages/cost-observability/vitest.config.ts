import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
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
