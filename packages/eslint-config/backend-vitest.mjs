// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import noSecrets from 'eslint-plugin-no-secrets';
import promisePlugin from 'eslint-plugin-promise';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

/**
 * @typedef {object} BackendVitestConfigOptions
 * @property {string} tsconfigRootDir
 * @property {string[]} [ignores]
 * @property {string[]} [testFiles]
 * @property {string[]} [scriptFiles]
 * @property {import('typescript-eslint').ConfigArray} [extraConfigs]
 */

/**
 * Create a shared ESLint flat config for backend TypeScript workspaces using Vitest.
 *
 * @param {BackendVitestConfigOptions} options
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createBackendVitestConfig(options) {
  const {
    tsconfigRootDir,
    ignores = [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test/coverage-ignore-decorators.js',
      '.claude/**',
      'reports/**',
      'scripts/**',
    ],
    testFiles = [
      '**/*.spec.ts',
      '**/*.test.ts',
      'src/test-utils/**/*.ts',
      'vitest.setup.ts',
    ],
    scriptFiles = ['scripts/**/*.{js,ts}', '*.config.{js,mjs,ts}'],
    extraConfigs = [],
  } = options;

  if (!tsconfigRootDir) {
    throw new Error('createBackendVitestConfig requires tsconfigRootDir');
  }

  return tseslint.config(
    {
      ignores,
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    eslintPluginPrettierRecommended,
    sonarjs.configs.recommended,
    promisePlugin.configs['flat/recommended'],
    {
      languageOptions: {
        globals: {
          ...globals.node,
          ...globals.vitest,
        },
        sourceType: 'module',
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    {
      plugins: {
        'simple-import-sort': simpleImportSort,
        unicorn,
        'no-secrets': noSecrets,
      },
      rules: {
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'no-duplicate-imports': 'error',

        'no-secrets/no-secrets': [
          'error',
          {
            tolerance: 4.5,
            ignoreContent: ['^SUPABASE_', '^NODE_ENV', '^PORT'],
            additionalDelimiters: ['"', "'", '`'],
          },
        ],

        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unnecessary-condition': 'warn',
        '@typescript-eslint/prefer-nullish-coalescing': 'warn',
        '@typescript-eslint/prefer-optional-chain': 'error',

        'sonarjs/cognitive-complexity': ['error', 20],
        'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
        'sonarjs/no-identical-functions': 'error',
        'sonarjs/no-collapsible-if': 'warn',

        'promise/prefer-await-to-then': 'error',
        'promise/no-return-wrap': 'error',
        'promise/catch-or-return': 'error',
        'promise/no-nesting': 'warn',
        'promise/no-callback-in-promise': 'warn',

        'unicorn/error-message': 'error',
        'unicorn/prefer-node-protocol': 'error',
        'unicorn/prefer-ternary': 'warn',
        'unicorn/no-useless-undefined': 'error',
        'unicorn/consistent-function-scoping': 'warn',
        'unicorn/new-for-builtins': 'off',

        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-null': 'off',
        'unicorn/no-array-for-each': 'off',
        'unicorn/prefer-module': 'off',

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
      files: testFiles,
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        'unicorn/consistent-function-scoping': 'off',

        'sonarjs/cognitive-complexity': 'off',
        'sonarjs/no-duplicate-string': 'off',

        'promise/prefer-await-to-then': 'off',

        'no-console': 'off',
        'unicorn/no-useless-undefined': 'off',
      },
    },
    {
      files: scriptFiles,
      rules: {
        'no-console': 'off',
        'sonarjs/cognitive-complexity': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    ...extraConfigs,
  );
}

export default createBackendVitestConfig;
