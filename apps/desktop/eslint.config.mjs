// @ts-check
import { createNodeTsConfig } from '@zapengine/eslint-config/node-ts';

export default createNodeTsConfig({
  ignores: [
    'coverage/**',
    'node_modules/**',
    'src-tauri/target/**',
    'vitest.config.ts',
  ],
});
