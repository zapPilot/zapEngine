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
      // Baseline on 2026-07-29 (statements/branches/functions/lines):
      // 59.90/63.05/62.98/60.71.
      // Keep a two-point buffer for normal churn, then ratchet upward.
      thresholds: {
        statements: 57,
        branches: 61,
        functions: 60,
        lines: 58,
      },
    },
  },
});
