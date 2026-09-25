import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'examples/basic-usage.ts',
    'examples/gmx-v2-deposit-fork-replay.ts',
    'examples/hyperliquid-hlp-verify.ts',
  ],
  project: ['src/**/*.ts', 'test/**/*.ts', 'examples/**/*.ts'],
  vitest: {
    entry: ['test/**/*.{test,spec}.ts'],
  },
});
