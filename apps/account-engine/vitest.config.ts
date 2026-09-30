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
      reporter: ['text', 'json-summary', 'html', 'clover', 'json', 'lcov'],
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
        'src/modules/plan-orchestration/**',
        'src/common/validation/wallet-address.util.ts',
      ],
      // Canonical CI coverage is 100% across every reported dimension as of
      // 2026-09-29. Pin the identity/persistence plane there so regressions fail.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
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
        find: /^@zapengine\/types\/api$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/types/src/api/index.ts',
        ),
      },
      {
        find: /^@zapengine\/types\/shared$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/types/src/shared/index.ts',
        ),
      },
      {
        find: /^@zapengine\/types\/(.*)$/,
        replacement: path.resolve(__dirname, '__mocks__/@zapengine/types/$1'),
      },
    ],
  },
  esbuild: {
    target: 'es2022',
  },
});
