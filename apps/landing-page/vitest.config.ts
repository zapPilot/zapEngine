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
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/app/**',
        'src/types/**',
        'src/**/index.ts',
        'src/test-utils/**',
      ],
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 60,
        lines: 65,
        'src/hooks/useMediaQuery.ts': {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
        'src/hooks/useReducedMotion.ts': {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
