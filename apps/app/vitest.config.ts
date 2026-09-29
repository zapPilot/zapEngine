import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html'],
      include: [
        'src/integration/**',
        'src/lib/**',
        'src/config/**',
        'src/data/**',
      ],
      exclude: ['src/integration/podcastPlayer.ts'],
      // Canonical CI coverage is 100% across every reported dimension as of
      // 2026-09-29; keep regressions from silently reopening covered paths.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
