import { defineKnipConfig } from '@zapengine/knip-config/base';
export default defineKnipConfig({
  project: ['src/**/*.ts'],
  vitest: { config: ['vitest.config.ts'] },
});
