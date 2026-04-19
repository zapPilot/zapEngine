import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noSecrets from 'eslint-plugin-no-secrets';
import promisePlugin from 'eslint-plugin-promise';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

/**
 * @typedef {object} ReactViteConfigOptions
 * @property {string} tsconfigPath
 * @property {string} tsconfigRootDir
 * @property {string[]} [ignores]
 * @property {import('typescript-eslint').ConfigArray} [extraConfigs]
 */

/**
 * Create a shared ESLint flat config for React + Vite TypeScript workspaces.
 *
 * @param {ReactViteConfigOptions} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createReactViteConfig(options) {
  const {
    tsconfigPath,
    tsconfigRootDir,
    ignores = [
      '.jscpd/**/*',
      'jscpd-report/**/*',
      '**/*.md',
      'coverage/**/*',
      'out/**/*',
      'dist/**/*',
      'playwright-report/**/*',
      'test-results/**/*',
      '.claude/**/*',
      '**/__snapshots__/**',
      'tsconfig.test.json',
    ],
    extraConfigs = [],
  } = options;

  if (!tsconfigPath || !tsconfigRootDir) {
    throw new Error(
      'createReactViteConfig requires both tsconfigPath and tsconfigRootDir.',
    );
  }

  return [
    {
      ignores,
    },

    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,

    sonarjs.configs.recommended,

    promisePlugin.configs['flat/recommended'],

    {
      plugins: {
        unicorn,
      },
      rules: {
        'unicorn/error-message': 'error',
        'unicorn/no-array-for-each': 'error',
        'unicorn/prefer-module': 'error',
        'unicorn/prefer-node-protocol': 'error',
        'unicorn/prefer-ternary': 'warn',
        'unicorn/no-useless-undefined': 'error',
        'unicorn/consistent-function-scoping': 'off',
      },
    },

    {
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooksPlugin,
        'jsx-a11y': jsxA11y,
        'simple-import-sort': simpleImportSort,
        'no-secrets': noSecrets,
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
      languageOptions: {
        parserOptions: {
          project: tsconfigPath,
          tsconfigRootDir,
        },
      },
      rules: {
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'no-duplicate-imports': 'error',

        'no-secrets/no-secrets': [
          'error',
          {
            tolerance: 4.5,
            ignoreContent: ['^NEXT_PUBLIC_', '^PUBLIC_'],
            additionalDelimiters: ['"', "'", '`'],
          },
        ],

        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': [
          'error',
          {
            checksVoidReturn: {
              arguments: false,
              attributes: false,
            },
          },
        ],
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unnecessary-condition': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'error',
        '@typescript-eslint/unified-signatures': 'off',

        'sonarjs/cognitive-complexity': ['error', 20],
        'sonarjs/no-nested-functions': ['warn', { threshold: 6 }],
        'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
        'sonarjs/no-duplicated-branches': 'error',
        'sonarjs/no-identical-functions': 'error',
        'sonarjs/no-collapsible-if': 'off',
        'sonarjs/prefer-read-only-props': 'off',
        'sonarjs/no-nested-conditional': 'off',
        'sonarjs/no-inverted-boolean-check': 'off',
        'sonarjs/no-one-iteration-loop': 'off',
        'sonarjs/prefer-immediate-return': 'off',
        'sonarjs/pseudo-random': 'off',
        'sonarjs/use-type-alias': 'off',
        'sonarjs/prefer-single-boolean-return': 'warn',
        'sonarjs/no-nested-template-literals': 'off',
        'sonarjs/function-return-type': 'off',
        'sonarjs/prefer-regexp-exec': 'off',
        'sonarjs/void-use': 'off',

        'promise/prefer-await-to-then': 'error',
        'promise/no-return-wrap': 'error',
        'promise/catch-or-return': 'error',
        'promise/no-nesting': 'warn',
        'promise/no-callback-in-promise': 'warn',

        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/display-name': 'error',
        'react/jsx-key': 'error',

        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',

        'no-console': 'warn',
        'no-debugger': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        'object-shorthand': 'error',
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
      },
    },

    {
      plugins: {
        import: importPlugin,
      },
      settings: {
        'import/resolver': {
          node: {
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
          },
        },
        'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
      },
      rules: {
        'import/no-duplicates': 'error',
        'import/no-deprecated': 'warn',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-anonymous-default-export': 'warn',
        'import/no-cycle': 'off',
        'import/no-unused-modules': 'off',
      },
    },

    {
      files: ['src/utils/logger.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['src/lib/http-utils.ts'],
      rules: {
        'sonarjs/prefer-single-boolean-return': 'off',
      },
    },
    {
      files: ['tests/**/*', '**/*.test.*', '**/*.spec.*'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',

        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',

        'sonarjs/cognitive-complexity': 'off',
        'sonarjs/no-duplicate-string': 'off',
        'sonarjs/no-nested-functions': 'off',
        'sonarjs/no-identical-functions': 'off',
        'sonarjs/assertions-in-tests': 'off',
        'sonarjs/no-ignored-exceptions': 'off',
        'sonarjs/class-name': 'off',
        'sonarjs/no-unused-vars': 'off',
        'sonarjs/no-dead-store': 'off',

        'promise/prefer-await-to-then': 'off',

        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],

        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'unicorn/prefer-module': 'off',
        '@typescript-eslint/no-useless-constructor': 'off',
        'no-console': 'off',
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      files: ['src/hooks/**/*.ts', 'src/hooks/**/*.tsx'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'sonarjs/cognitive-complexity': ['warn', 45],
        'sonarjs/prefer-single-boolean-return': 'off',
      },
    },
    {
      files: [
        'scripts/**/*.{js,ts}',
        'cloudflare/**/*.js',
        '*.config.{js,mjs,ts}',
      ],
      languageOptions: {
        globals: {
          console: true,
          process: true,
          require: true,
          module: true,
          __dirname: true,
          __filename: true,
        },
      },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        'no-console': 'off',
        'sonarjs/cognitive-complexity': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        'unicorn/prefer-module': 'off',
        'unicorn/prefer-node-protocol': 'off',
        'unicorn/no-array-for-each': 'off',
      },
    },

    ...extraConfigs,
    {
      files: [
        'cloudflare/**/*.js',
        'scripts/**/*.{js,ts}',
        'tests/**/*.{js,ts,tsx}',
      ],
      languageOptions: {
        parserOptions: {
          project: null,
        },
      },
      rules: {
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-unnecessary-condition': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
      },
    },
  ];
}

export default createReactViteConfig;
