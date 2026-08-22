import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
});
