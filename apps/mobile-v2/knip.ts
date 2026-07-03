import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'entrypoint.js',
    'app.config.ts',
    'metro.config.js',
    'tests/**/*.test.ts',
  ],
  project: [
    'src/**/*.{ts,tsx}',
    'tests/**/*.ts',
    'app.config.ts',
    'vitest.config.ts',
  ],
  ignoreDependencies: [
    '@expo/metro-config',
    '@privy-io/expo-native-extensions',
    // Workspace packages imported only via subpath exports (dist); knip cannot
    // map those back to the dependency, so it false-positives them as unused.
    '@zapengine/app-core',
    '@zapengine/design-tokens',
    // Not imported directly, but app-core's public .d.ts surface references it
    // and pnpm's strict node_modules needs it declared to resolve.
    '@zapengine/types',
    'expo-apple-authentication',
    'expo-application',
    'expo-crypto',
    'expo-dev-client',
    'expo-linking',
    'expo-secure-store',
    'expo-system-ui',
    'expo-updates',
    'expo-web-browser',
    'react-native-passkeys',
    'react-native-webview',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
