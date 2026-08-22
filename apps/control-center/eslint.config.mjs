import { createNodeTsConfig } from '@zapengine/eslint-config/node-ts';

export default createNodeTsConfig({
  extraConfigs: [
    {
      files: ['src/client/**/*.{ts,tsx}'],
      languageOptions: {
        globals: {
          document: 'readonly',
          window: 'readonly',
          fetch: 'readonly',
          Intl: 'readonly',
          URLSearchParams: 'readonly',
        },
      },
    },
    {
      files: ['src/server/main.ts', 'src/server/sync.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
});
