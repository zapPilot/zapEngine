import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
  project: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
  // knip cannot follow either of these back to a source file: the cost
  // observability package is consumed through its dist-mapped `exports`, and
  // the design tokens arrive as a CSS side-effect import in `main.tsx`.
  ignoreDependencies: [
    '@zapengine/cost-observability',
    '@zapengine/design-tokens',
    '@zapengine/types',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.{ts,tsx}'],
  },
});
