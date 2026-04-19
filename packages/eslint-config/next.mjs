// @ts-check
import { FlatCompat } from '@eslint/eslintrc';

/**
 * @typedef {object} NextConfigOptions
 * @property {string} tsconfigRootDir
 * @property {string[]} [ignores]
 * @property {import('eslint').Linter.FlatConfig[]} [extraConfigs]
 */

/**
 * Create a shared ESLint flat config for Next.js + TypeScript workspaces.
 *
 * @param {NextConfigOptions} options
 * @returns {import('eslint').Linter.FlatConfig[]}
 */
export function createNextConfig(options) {
  const {
    tsconfigRootDir,
    ignores = [
      'node_modules/**',
      '.next/**',
      '.source/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      '.jscpd/**',
      '.claude/**',
      'scripts/**',
      'coverage/**',
    ],
    extraConfigs = [],
  } = options;

  if (!tsconfigRootDir) {
    throw new Error('createNextConfig requires tsconfigRootDir');
  }

  const compat = new FlatCompat({
    baseDirectory: tsconfigRootDir,
  });

  return [
    ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
    {
      files: ['**/*.{js,jsx,ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        'react/no-unescaped-entities': 'off',
        'react/display-name': 'off',
        'react-hooks/exhaustive-deps': 'warn',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-debugger': 'error',
        'prefer-const': 'error',
      },
    },
    {
      files: ['jest.setup.js', 'src/test-utils/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        'import/no-anonymous-default-export': 'off',
      },
    },
    {
      ignores,
    },
    ...extraConfigs,
  ];
}

export default createNextConfig;
