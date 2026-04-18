import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // React/Next.js best practices
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      'react-hooks/exhaustive-deps': 'warn',

      // General code quality
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
      '@typescript-eslint/no-unused-vars': 'off', // Mock files intentionally ignore vars
      '@typescript-eslint/no-empty-object-type': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
  {
    ignores: [
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
  },
];

export default eslintConfig;
