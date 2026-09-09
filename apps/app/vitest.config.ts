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
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'src/integration/**',
        'src/lib/**',
        'src/config/**',
        'src/data/**',
      ],
      exclude: ['src/integration/podcastPlayer.ts'],
      // Ratcheted from the 2026-09-08 measured baseline
      // (68.34/71.50/72.63/69.10) with ~4 points of churn buffer.
      thresholds: {
        statements: 64,
        branches: 67,
        functions: 68,
        lines: 65,
      },
    },
  },
});
