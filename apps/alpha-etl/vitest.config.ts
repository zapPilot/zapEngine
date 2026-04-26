import type { ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = {
  test: {
    // Resource controls: single worker to prevent memory exhaustion
    maxWorkers: 1,
    minWorkers: 1,
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/global-setup.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'html', 'clover', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'migrations/',
        '.claude/**',
        'coverage/**',
        '**/*.d.ts',
        'scripts/',
        'vitest.config.ts',
        'src/pipelines/**',
        'src/modules/sentiment/index.ts',
        'src/modules/token-price/index.ts',
      ],
      thresholds: {
        statements: 92,
        branches: 92,
        functions: 92,
        lines: 92,
      },
    },
    testTimeout: 30000, // ETL operations can be slow
    hookTimeout: 30000,
    teardownTimeout: 30000,
    // Separate test files by type for better organization
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules/',
      'dist/',
      '.{idea,git,cache,output,temp}/',
      'tests/fixtures/**',
    ],
  },
  // Enable TypeScript support with proper ES modules handling
  esbuild: {
    target: 'es2022',
  },
  // Handle ES modules imports properly
  define: {
    'import.meta.vitest': 'undefined',
  },
};

export default config;
