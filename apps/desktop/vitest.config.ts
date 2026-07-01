import path from 'node:path';

import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@zapengine\/app-core\/(.*)$/,
        replacement: `${repoRoot}/packages/app-core/src/$1`,
      },
      {
        find: /^@zapengine\/app-core$/,
        replacement: `${repoRoot}/packages/app-core/src/index.ts`,
      },
      {
        find: /^@core\/(.*)$/,
        replacement: `${repoRoot}/packages/app-core/src/$1`,
      },
      {
        find: /^@zapengine\/intent-engine\/gmx-v2$/,
        replacement: `${repoRoot}/packages/intent-engine/src/protocols/gmx-v2/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine\/morpho$/,
        replacement: `${repoRoot}/packages/intent-engine/src/protocols/morpho/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine\/types$/,
        replacement: `${repoRoot}/packages/intent-engine/src/types/index.ts`,
      },
      {
        find: /^@zapengine\/intent-engine$/,
        replacement: `${repoRoot}/packages/intent-engine/src/index.ts`,
      },
      {
        find: /^@zapengine\/types\/(.*)$/,
        replacement: `${repoRoot}/packages/types/src/$1`,
      },
      {
        find: /^@zapengine\/types$/,
        replacement: `${repoRoot}/packages/types/src/index.ts`,
      },
    ],
  },
});
