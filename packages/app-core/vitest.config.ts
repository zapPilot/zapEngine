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
      // Ratcheted from the 2026-09-08 measured baseline
      // (79.71/70.58/77.91/80.86) with ~4 points of churn buffer.
      thresholds: {
        statements: 75,
        branches: 66,
        functions: 73,
        lines: 76,
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