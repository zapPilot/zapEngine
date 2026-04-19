// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @typedef {object} NodeTsConfigOptions
 * @property {string[]} [ignores]
 * @property {boolean} [allowUnderscoreUnused]
 * @property {import('typescript-eslint').ConfigArray} [extraConfigs]
 */

/**
 * Create a shared ESLint flat config for Node + TypeScript workspaces.
 *
 * @param {NodeTsConfigOptions} [options]
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createNodeTsConfig(options = {}) {
  const {
    ignores = ['dist/**', 'node_modules/**', '.turbo/**', 'coverage/**', '**/*.js'],
    allowUnderscoreUnused = false,
    extraConfigs = [],
  } = options;

  const unusedVarsRule = allowUnderscoreUnused
    ? [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ]
    : 'error';

  return tseslint.config(
    {
      ignores,
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: {
          ...globals.node,
        },
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    {
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': unusedVarsRule,
        '@typescript-eslint/no-explicit-any': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        'no-console': 'warn',
        eqeqeq: ['error', 'always'],
        curly: ['warn', 'all'],
        'no-return-await': 'warn',
        'prefer-arrow-callback': 'error',
        'no-param-reassign': 'error',
        'no-duplicate-imports': 'error',
        'no-template-curly-in-string': 'error',
        'array-callback-return': 'error',
        'consistent-return': 'warn',
        'no-throw-literal': 'error',
        'no-useless-catch': 'error',
        'prefer-promise-reject-errors': 'error',
      },
    },
    ...extraConfigs,
  );
}

export default createNodeTsConfig;
