import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noSecrets from "eslint-plugin-no-secrets";
import promisePlugin from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import { dirname, join } from "path";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const eslintProjectConfig = join(__dirname, "tsconfig.eslint.json");

const eslintConfig = [
  {
    ignores: [
      ".jscpd/**/*",
      "jscpd-report/**/*",
      "**/*.md",
      "coverage/**/*",
      "out/**/*",
      "dist/**/*",
      "playwright-report/**/*",
      "test-results/**/*",
      ".claude/**/*",
      "**/__snapshots__/**",
      "tsconfig.test.json",
    ],
  },

  // TypeScript strict and stylistic configs
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Code smell detection
  sonarjs.configs.recommended,

  // Promise/async best practices
  promisePlugin.configs['flat/recommended'],

  // Modern JavaScript patterns (with selected rules to avoid being too opinionated)
  {
    plugins: {
      unicorn,
    },
    rules: {
      // Enable only practical unicorn rules
      'unicorn/error-message': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/prefer-module': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-ternary': 'warn',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/consistent-function-scoping': 'off',  // React closures over props/state are intentional
    }
  },

  // Custom rules and plugins
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11y,
      'simple-import-sort': simpleImportSort,
      'no-secrets': noSecrets,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    languageOptions: {
      parserOptions: {
        project: eslintProjectConfig,
        tsconfigRootDir: __dirname,
      },
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
      'no-secrets/no-secrets': ['error', {
        tolerance: 4.5,
        ignoreContent: ['^NEXT_PUBLIC_', '^PUBLIC_'],  // Allow public env vars
        additionalDelimiters: ['"', "'", '`'],
      }],

      // ========================================
      // TypeScript Strict Rules
      // ========================================
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',       // Catch unhandled promises
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: {
          arguments: false,
          attributes: false,
        },
      }],                                                      // Catch promise mistakes while allowing async React handlers
      '@typescript-eslint/await-thenable': 'error',             // Only await promises
      '@typescript-eslint/no-unnecessary-condition': 'off',     // Too many false positives with optional chaining
      '@typescript-eslint/prefer-nullish-coalescing': 'off',    // Pure bikeshedding - no safety benefit
      '@typescript-eslint/prefer-optional-chain': 'error',      // Use ?. for optional access
      '@typescript-eslint/unified-signatures': 'off',           // Disabled due to compatibility issue

      // ========================================
      // Code Smell Detection (SonarJS)
      // ========================================
      'sonarjs/cognitive-complexity': ['error', 20],            // Max complexity per function (reduced from 35)
      'sonarjs/no-nested-functions': ['warn', { threshold: 6 }], // Allow React event handler patterns
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],  // Catch magic strings (5+ duplicates, reduced noise)
      'sonarjs/no-duplicated-branches': 'error',                // Catch duplicate logic in branches (upgraded from warn)
      'sonarjs/no-identical-functions': 'error',                // Detect duplicate functions
      'sonarjs/no-collapsible-if': 'off',                       // Sometimes separate conditions are clearer
      'sonarjs/prefer-read-only-props': 'off',                  // Allow standard React prop typing
      'sonarjs/no-nested-conditional': 'off',                   // Nested ternaries in JSX are idiomatic React
      'sonarjs/no-inverted-boolean-check': 'off',               // Pedantic: allow inverted boolean patterns when clearer
      'sonarjs/no-one-iteration-loop': 'off',                   // Pedantic: allow single-iteration loops for control flow
      'sonarjs/prefer-immediate-return': 'off',                 // Pedantic: allow staged return logic for readability
      'sonarjs/pseudo-random': 'off',                           // Allow Math.random for UI effects
      'sonarjs/use-type-alias': 'off',                          // Optional type alias usage
      'sonarjs/prefer-single-boolean-return': 'warn',           // Informational only
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/function-return-type': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/void-use': 'off',

      // ========================================
      // Promise/Async Patterns
      // ========================================
      'promise/prefer-await-to-then': 'error',                  // Use async/await over .then()
      'promise/no-return-wrap': 'error',                        // No unnecessary Promise wrapping
      'promise/catch-or-return': 'error',                       // Handle promise errors
      'promise/no-nesting': 'warn',                             // Avoid nested promises
      'promise/no-callback-in-promise': 'warn',                 // No callbacks in promises

      // ========================================
      // React Specific Rules
      // ========================================
      "react/react-in-jsx-scope": "off",                        // Not needed in modern React
      "react/prop-types": "off",                                // Using TypeScript
      "react/display-name": "error",
      "react/jsx-key": "error",

      // ========================================
      // React Hooks Rules
      // ========================================
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // ========================================
      // General Code Quality Rules
      // ========================================
      "no-console": "warn",
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    }
  },

  // ========================================
  // Import Quality & Circular Dependency Detection
  // ========================================
  {
    plugins: {
      'import': importPlugin,
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
      // Import organization and quality
      'import/no-duplicates': 'error',                    // Merge duplicate imports
      'import/no-deprecated': 'warn',                     // Warn on deprecated APIs
      'import/first': 'error',                            // Imports at top of file
      'import/newline-after-import': 'error',             // Blank line after imports
      'import/no-anonymous-default-export': 'warn',       // Named exports preferred

      // Circular dependency detection remains noisy with project-wide aliases
      'import/no-cycle': 'off',

      // Disabled because route entrypoints and barrel exports confuse static usage checks
      'import/no-unused-modules': 'off',
    }
  },

  // ========================================
  // File-Specific Overrides
  // ========================================
  {
    files: ["src/utils/logger.ts"],
    rules: {
      // Centralized logger is allowed to use console
      "no-console": "off"
    }
  },
  {
    files: ["src/lib/http-utils.ts"],
    rules: {
      // Early return pattern is clearer for retry logic
      "sonarjs/prefer-single-boolean-return": "off"
    }
  },
  {
    files: ["tests/**/*", "**/*.test.*", "**/*.spec.*"],
    rules: {
      // Disable React hooks rules for test files
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",

      // Relax TypeScript rules for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",

      // Relax code complexity for tests
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-nested-functions": "off",         // Tests naturally nest describe/it/test
      "sonarjs/no-identical-functions": "off",      // Test setup may duplicate
      "sonarjs/assertions-in-tests": "off",         // Some tests are integration tests
      "sonarjs/no-ignored-exceptions": "off",       // Tests may test error throwing
      "sonarjs/class-name": "off",                  // Test mocks may use _ClassName pattern
      "sonarjs/no-unused-vars": "off",              // Allow unused vars in tests
      "sonarjs/no-dead-store": "off",               // Allow dead store in tests

      // Relax promise rules for tests
      "promise/prefer-await-to-then": "off",

      // Allow unused vars with underscore prefix
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "ignoreRestSiblings": true
      }],

      // Allow require() in tests
      "@typescript-eslint/no-require-imports": "off",

      // Allow non-null assertions in test files (test data is controlled)
      "@typescript-eslint/no-non-null-assertion": "off",

      // Allow require() for Vitest mocks (hoisted before imports)
      "unicorn/prefer-module": "off",

      // Allow mock constructors (necessary for test setup)
      "@typescript-eslint/no-useless-constructor": "off",

      // Allow console in tests
      "no-console": "off",

      // Allow undefined returns in async callbacks for tests
      "unicorn/no-useless-undefined": "off"
    }
  },
  {
    files: ['src/hooks/**/*.ts', 'src/hooks/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      "@typescript-eslint/explicit-function-return-type": "off", // Hooks leverage inference for ergonomics
      "sonarjs/cognitive-complexity": ["warn", 45],               // Allow richer hook orchestration before flagging
      'sonarjs/prefer-single-boolean-return': 'off',              // React Query's enabled pattern is idiomatic
    }
  },
  {
    files: ["scripts/**/*.{js,ts}", "cloudflare/**/*.js", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: {
        console: true,
        process: true,
        require: true,
        module: true,
        __dirname: true,
        __filename: true
      }
    },
    rules: {
      // Scripts may use require() and console
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",

      // Relax complexity for config/script files
      "sonarjs/cognitive-complexity": "off",

      // Allow any in scripts
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",

      // Allow CommonJS patterns in scripts
      "unicorn/prefer-module": "off",              // Scripts may use CommonJS require()
      "unicorn/prefer-node-protocol": "off",       // node: prefix not required in scripts
      "unicorn/no-array-for-each": "off",          // forEach is acceptable in scripts
    }
  },
  {
    files: [
      "cloudflare/**/*.js",
      "scripts/**/*.{js,ts}",
      "tests/**/*.{js,ts,tsx}"
    ],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
    },
  },
  {
    ignores: [
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "public/**",
      "node_modules/**"
    ]
  }
];

export default eslintConfig;
