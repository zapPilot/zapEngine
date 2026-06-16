// Vitest config for @zapengine/intent-engine.
//
// The intent-engine is the routing core — every uncovered branch is a money-
// movement risk surface. Coverage thresholds are deliberately strict and
// match the per-workspace targets documented in scripts/COVERAGE.md.
//
// The package was previously running with no vitest.config.ts (default
// discovery). Adding this file is intentional — it makes coverage explicit
// and locks in the thresholds in CI via `pnpm test coverage`.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.constants.ts',
        'src/types/**',
        // Pure data — registry tables, not behavior:
        'src/registry/chains.ts',
        'src/registry/vaults.ts',
        // ABI re-exports:
        'src/protocols/morpho/morpho.constants.ts',
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
