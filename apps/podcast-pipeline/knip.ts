import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  ignore: ['**/*.test.ts', 'vitest.config.ts'],
  vitest: { config: ['vitest.config.ts'], entry: ['src/**/*.test.ts'] },
});
