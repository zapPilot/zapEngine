// @ts-check
import { createNodeTsConfig } from '@zapengine/eslint-config/node-ts';

export default createNodeTsConfig({
  ignores: [
    'dist/**',
    'node_modules/**',
    '.turbo/**',
    'coverage/**',
    '**/*.js',
  ],
  allowUnderscoreUnused: true,
  extraConfigs: [
    {
      files: ['examples/**/*.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
});
