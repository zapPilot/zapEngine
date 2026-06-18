// Vitest config for @zapengine/types.
//
// These thresholds guard the Zod schemas with parse-level tests, so silent
// contract drift fails here instead of surfacing later in downstream consumers.
// Thresholds match the per-workspace targets documented in scripts/COVERAGE.md.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/strategy/json.ts', // Type-only re-export module
        'src/etl/**', // ETL contracts — owned by alpha-etl, exercised there
      ],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
