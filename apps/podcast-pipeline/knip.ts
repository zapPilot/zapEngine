import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.{ts,tsx}'],
  ignore: [],
  vitest: { config: ['vitest.config.ts'], entry: ['src/**/*.test.ts'] },
});
