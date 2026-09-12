import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Only the roots knip cannot derive itself. The Vite client entry, the CLIs
  // and the daemons are all reached through package.json scripts or index.html,
  // so listing them here would be redundant. Keep this narrower than `project`:
  // when the two globs match the same files, every file is an entry point and
  // knip can never report an unused file or export.
  entry: ['api/index.ts', 'src/server/main.ts'],
  project: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
  // knip cannot follow either of these back to a source file: the cost
  // observability package is consumed through its dist-mapped `exports`, and
  // the design tokens arrive as CSS.
  ignoreDependencies: [
    '@zapengine/cost-observability',
    '@zapengine/design-tokens',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.{ts,tsx}'],
  },
});
