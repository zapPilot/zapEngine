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
      thresholds: {
        // Temporary POC floor while the track-record dashboard is being backfilled
        // with tests. Keep this scoped to landing-page so deploys are not blocked
        // without weakening coverage gates for the app/product workspaces.
        statements: 50,
        branches: 45,
        functions: 55,
        lines: 50,
      },
    },
  },
});
