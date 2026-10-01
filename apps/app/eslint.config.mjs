import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import { designSystemRules, ratchet } from './eslint/design-system.mjs';
import {
  nativeRestrictions,
  webRestrictions,
} from './eslint/import-boundaries.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const baselineDirectory = path.join(root, 'eslint/design-system-baseline');
const baseline = Object.assign(
  {},
  ...(await Promise.all(
    fs
      .readdirSync(baselineDirectory)
      .filter((file) => file.endsWith('.mjs'))
      .map(
        async (file) =>
          (await import(path.join(baselineDirectory, file))).default,
      ),
  )),
);
const react = expoConfig.find((config) => config.plugins?.react)?.plugins.react;
// Code-valued props are checked by types and the design-token rules. Visible
// copy (including title, placeholder and accessibilityLabel) stays translated.
const codeProps = new Set([
  'className',
  'variant',
  'tone',
  'size',
  'feedback',
  'width',
  'layout',
  'mode',
  'padding',
  'radius',
  'screen',
  'testID',
  'id',
  'nativeID',
  'key',
  'href',
  'accessibilityRole',
  'role',
  'aria-current',
  'pointerEvents',
  'keyboardType',
  'keyboardShouldPersistTaps',
  'autoCapitalize',
  'autoComplete',
  'returnKeyType',
  'resizeMode',
  'name',
]);
const translatedJsxRule = {
  ...react.rules['jsx-no-literals'],
  create(context) {
    const wrapped = Object.create(context);
    Object.defineProperty(wrapped, 'report', {
      value(descriptor) {
        if (
          descriptor.node.type === 'JSXAttribute' &&
          codeProps.has(descriptor.node.name.name)
        )
          return;
        context.report(descriptor);
      },
    });
    return react.rules['jsx-no-literals'].create(wrapped);
  },
};
const guardedReact = {
  ...react,
  rules: {
    ...react.rules,
    'jsx-no-literals': ratchet(
      'react/jsx-no-literals',
      translatedJsxRule,
      baseline,
      root,
    ),
  },
};
const eventHandlerRestriction = {
  selector:
    'JSXAttribute[name.name=/^on[A-Z]/] > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)[async=true]',
  message:
    'A JSX event handler must not be async: its promise is discarded. Handle rejection inside a synchronous handler.',
};
const integrationRestriction = {
  selector: "ImportDeclaration[source.value='react-native']",
  message:
    'src/integration must stay platform-neutral; keep React Native imports in screens, components, or providers.',
};
const uiFiles = ['src/**/*.{ts,tsx}'];
const uiIgnores = ['src/components/token/**', 'src/**/WalletBrandIcon.tsx'];

export default defineConfig([
  ...expoConfig.map((config) =>
    config.plugins?.react
      ? { ...config, plugins: { ...config.plugins, react: guardedReact } }
      : config,
  ),
  { ignores: ['dist/**', 'coverage/**', '.expo/**', 'bundle-bytecode.js'] },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', nativeRestrictions] },
  },
  {
    files: ['src/**/*.web.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', webRestrictions] },
  },
  {
    files: ['src/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', eventHandlerRestriction] },
  },
  // Flat config replaces rule arrays; combine both guards for integration TSX.
  {
    files: ['src/integration/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        integrationRestriction,
        eventHandlerRestriction,
      ],
    },
  },
  {
    files: uiFiles,
    ignores: uiIgnores,
    plugins: {
      'zap-ui': {
        rules: Object.fromEntries(
          Object.entries(designSystemRules).map(([name, rule]) => [
            name,
            ratchet('zap-ui/' + name, rule, baseline, root),
          ]),
        ),
      },
    },
    rules: {
      'zap-ui/no-raw-design-values': 'error',
      'zap-ui/no-raw-text': 'error',
      'zap-ui/no-direct-icon': 'error',
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: true,
          allowedStrings: [
            '·',
            '%',
            '$',
            '—',
            '−',
            '+',
            '/',
            '(',
            ')',
            ':',
            '×',
            '•',
            '–',
            '-',
            '→',
            '…',
            '',
          ],
        },
      ],
    },
  },
  { files: ['tests/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': 'off' } },
]);
