import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  includeEntryExports: false,
});
