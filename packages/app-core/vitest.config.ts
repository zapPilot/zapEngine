import { defineConfig } from 'vitest/config';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // Baseline on 2026-07-29 (statements/branches/functions/lines):
      // 55.59/44.95/48.88/56.90.
      // Keep a two-point buffer for normal churn, then ratchet upward.
      thresholds: {
        statements: 53,
        branches: 42,
        functions: 46,
        lines: 54,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@core',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@zapengine\/types\/(.*)$/,
        replacement: `${repoRoot}/packages/types/src/$1`,
      },
      {
        find: /^@zapengine\/types$/,
        replacement: `${repoRoot}/packages/types/src/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine\/gmx-v2$/,
        replacement: `${repoRoot}/packages/intent-engine/src/protocols/gmx-v2/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine\/morpho$/,
        replacement: `${repoRoot}/packages/intent-engine/src/protocols/morpho/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine\/types$/,
        replacement: `${repoRoot}/packages/intent-engine/src/types/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine$/,
        replacement: `${repoRoot}/packages/intent-engine/src/index.ts`,
      },
    ],
  },
});
