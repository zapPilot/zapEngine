import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // Generated data module — values are asserted against tokens.json in
      // tests; instrumenting it would only measure the literal itself.
      exclude: ['src/generated/**'],
      // Set at the measured baseline (42.1/37.5/42.85/42.1); raise only
      // after sustained coverage improvements.
      thresholds: {
        branches: 37,
        functions: 42,
        lines: 42,
        statements: 42,
      },
    },
  },
});
