import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig(
  {
    entry: [
      'babel.config.js',
      'metro.config.js',
      'scripts/serve-web.mjs',
      // expo-router discovers route files by convention; knip cannot trace them.
      'src/app/**/*.{ts,tsx}',
      // Metro resolves platform suffixes (.web) at bundle time, not through
      // imports that knip can trace from the native graph.
      'src/**/*.web.{ts,tsx}',
      'tests/**/*.test.ts',
      'tests/e2e/**/*.spec.ts',
    ],
    project: ['scripts/**/*.mjs', 'src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    ignoreDependencies: [
      '@expo/metro-config',
      // Referenced from babel.config.js by preset name for Expo's Metro/Babel pipeline.
      'babel-preset-expo',
      // Privy's direct peer dependencies are intentionally not ignored: each is
      // installed in this workspace and Knip traces it through the provider graph.
      // The web SDK is consumed through app-core, so this workspace declaration
      // remains necessary for pnpm's strict dependency resolution.
      '@privy-io/react-auth',
      // Workspace packages imported only via subpath exports (dist); knip cannot
      // map those back to the dependency, so it false-positives them as unused.
      '@zapengine/app-core',
      '@zapengine/design-tokens',
      // Not imported directly, but app-core's public .d.ts surface references it
      // and pnpm's strict node_modules needs it declared to resolve.
      '@zapengine/types',
      // Knip's Expo plugin treats these optional defaults as required whenever
      // updates and automatic UI style are enabled, even when they are not
      // installed in the application.
      'expo-system-ui',
      'expo-updates',
      // Babel resolves react-native-worklets/plugin during Metro bundling.
      'react-native-worklets',
      // babel jsxImportSource emits react-native-css-interop/jsx-runtime
      // imports; pnpm's strict node_modules needs it as a direct dependency.
      'react-native-css-interop',
      // app-core exposes the external-wallet adapter, while strict pnpm
      // resolution still requires the peer to be declared by this workspace.
      'wagmi',
    ],
    vitest: {
      config: ['vitest.config.ts'],
      entry: ['tests/**/*.test.ts'],
    },
  },
  {
    omitDefaultIgnoreDependencies: ['@zapengine/eslint-config'],
  },
);
