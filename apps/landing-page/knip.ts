import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: ['src/app/**/*.{ts,tsx}'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'src/config/index.ts',
    'src/hooks/index.ts',
    'src/lib/index.ts',
    'src/types/index.ts',
    'src/test-utils/index.ts',
  ],
  ignoreDependencies: ['postcss', 'eslint-config-next'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});
