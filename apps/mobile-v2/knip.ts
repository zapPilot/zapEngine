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
