import { defineKnipConfig } from '@zapengine/knip-config/base';

const config = defineKnipConfig({
  entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignoreDependencies: [
    'postcss',
    'eslint-config-next',
    // Only ever imported through the `./assets/*` subpath, which resolves to a
    // PNG rather than a module, so Knip never credits the dependency as used.
    '@zapengine/brand-assets',
    // Used from src/app/globals.css via @import; Knip does not resolve CSS
    // package imports as dependency usage.
    '@zapengine/design-tokens',
  ],
  // eslint-config-next pulls in @rushstack/eslint-patch, which rejects
  // non-ESLint callers (knip). Skip knip's ESLint plugin to avoid the crash.
  eslint: false,
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  includeEntryExports: true,
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});

// Run from the monorepo root so workspace symlinks remain dependencies in the graph.
const { entry, project, eslint, vitest, ...global } = config;
const workspaceConfig = {
  ...global,
  // Excluded workspaces must not execute their ESLint plugins. The selected
  // workspace keeps its original plugin setting below.
  eslint: false,
  workspaces: {
    'apps/landing-page': { entry, project, eslint, vitest },
  },
};

export default workspaceConfig;
