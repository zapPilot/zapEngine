// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import noSecrets from 'eslint-plugin-no-secrets';
import promisePlugin from 'eslint-plugin-promise';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test/coverage-ignore-decorators.js',
      '.claude/**',
      'reports/**',
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginPrettierRecommended,

  // SonarJS Code Quality
  sonarjs.configs.recommended,

  // Promise Best Practices
  promisePlugin.configs['flat/recommended'],

  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Main Configuration with All Quality Plugins
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      unicorn,
      'no-secrets': noSecrets,
    },
    rules: {
      // ========================================
      // Import Organization
      // ========================================
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-duplicate-imports': 'error',

      // ========================================
      // Security
      // ========================================
      'no-secrets/no-secrets': [
        'error',
        {
          tolerance: 4.5,
          ignoreContent: ['^SUPABASE_', '^NODE_ENV', '^PORT'],
          additionalDelimiters: ['"', "'", '`'],
        },
      ],

      // ========================================
      // TypeScript Strict Rules (Enhanced)
      // ========================================
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

      // ========================================
      // Code Smell Detection (SonarJS)
      // ========================================
      'sonarjs/cognitive-complexity': ['error', 20], // NestJS services can be complex
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }], // Higher threshold for NestJS
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'warn',

      // ========================================
      // Promise/Async Patterns
      // ========================================
      'promise/prefer-await-to-then': 'error',
      'promise/no-return-wrap': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-nesting': 'warn',
      'promise/no-callback-in-promise': 'warn',

      // ========================================
      // Modern JavaScript Patterns (Unicorn - Selective)
      // ========================================
      'unicorn/error-message': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/new-for-builtins': 'off',

      // NestJS-specific overrides
      'unicorn/prevent-abbreviations': 'off', // NestJS uses 'req', 'res', 'ctx'
      'unicorn/no-null': 'off', // TypeScript uses null
      'unicorn/no-array-for-each': 'off', // forEach is common in NestJS
      'unicorn/prefer-module': 'off', // NestJS uses CommonJS

      // ========================================
      // General Code Quality Rules
      // ========================================
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

  // ========================================
  // Test File Overrides
  // ========================================
  {
    files: [
      '**/*.spec.ts',
      '**/*.test.ts',
      'src/test-utils/**/*.ts',
      'jest.setup.ts',
    ],
    rules: {
      // Relax TypeScript rules for tests
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'unicorn/consistent-function-scoping': 'off',

      // Relax code complexity for tests
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',

      // Relax promise rules for tests
      'promise/prefer-await-to-then': 'off',

      // Allow console in tests
      'no-console': 'off',
      'unicorn/no-useless-undefined': 'off',
    },
  },

  // ========================================
  // Script Files Overrides
  // ========================================
  {
    files: ['scripts/**/*.{js,ts}', '*.config.{js,mjs,ts}'],
    rules: {
      'no-console': 'off',
      'sonarjs/cognitive-complexity': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
