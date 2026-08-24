import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    env: {
      // Telegram tests use reserved example hosts. Production keeps the
      // code-owned PANews allowlist unless this env is explicitly set.
      PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS: 'example.com,example.test',
    },
    // The bootstrap suite dynamically imports the full app graph on its first
    // test; give it the same budget other heavy workspaces use.
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 92,
        functions: 92,
        branches: 80,
        statements: 91,
      },
      exclude: [
        '**/*.test.ts',
        '**/__fixtures__/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        'src/types.ts',
        'eslint.config.mjs',
        'vitest.config.ts',
      ],
    },
  },
});
