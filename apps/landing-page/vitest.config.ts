import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: path.resolve(import.meta.dirname, 'src/$1'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', '.next/', 'out/'],
    css: false,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        'text-summary',
        'json-summary',
        'json',
        'html',
        'lcov',
      ],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test-utils/**',
        'src/types/**',
        'src/**/index.ts',
        'src/lib/source.ts',
      ],
      // Ratcheted from the 2026-09-14 production denominator
      // (86.57/78.74/91.62/87.93) with ~3 points of churn buffer.
      thresholds: {
        statements: 83,
        branches: 75,
        functions: 89,
        lines: 84,
      },
    },
  },
});
