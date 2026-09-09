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
      reporter: ['text', 'text-summary', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/app/**',
        'src/types/**',
        'src/**/index.ts',
        'src/lib/source.ts',
      ],
      // Ratcheted from the 2026-09-08 measured baseline
      // (83.87/71.97/87.31/85.72) with ~4 points of churn buffer.
      thresholds: {
        statements: 79,
        branches: 67,
        functions: 82,
        lines: 81,
      },
    },
  },
});
