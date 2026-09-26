import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    watch: false,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary', 'json'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
