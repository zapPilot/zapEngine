import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: 1,
    include: ['test/unit/**/*.spec.ts', 'test/e2e/**/*.e2e-spec.ts'],
    exclude: ['node_modules/', 'dist/'],
    setupFiles: ['./vitest.setup.ts'],
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover', 'json', 'lcov'],
      include: ['src/**/*.{ts,js}'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/test-utils/**',
        '**/*.dto.ts',
        '**/*.interface.ts',
        'src/main.ts',
        'src/container.ts',
        'src/common/constants/**',
        'src/types/**',
        'src/users/constants/**',
        'src/users/interfaces/**',
        '**/index.ts',
      ],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
      reportsDirectory: 'coverage',
    },
  },
  resolve: {
    alias: [
      {
        find: /^@zapengine\/types\/strategy$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/types/src/strategy/index.ts',
        ),
      },
      {
        find: /^@zapengine\/types\/(.*)$/,
        replacement: path.resolve(__dirname, '__mocks__/@zapengine/types/$1'),
      },
      {
        find: /^@common\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/common/$1'),
      },
      {
        find: /^@database\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/database/$1'),
      },
      {
        find: /^@modules\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/modules/$1'),
      },
      {
        find: /^@users\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/users/$1'),
      },
      {
        find: /^@config\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/config/$1'),
      },
      {
        find: /^@db-types\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/types/$1'),
      },
      {
        find: /^@routes\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/routes/$1'),
      },
      {
        find: '@container',
        replacement: path.resolve(__dirname, 'src/container.ts'),
      },
      {
        find: '@test-utils',
        replacement: path.resolve(__dirname, 'test/test-utils/index.ts'),
      },
    ],
  },
  esbuild: {
    target: 'es2022',
  },
});
