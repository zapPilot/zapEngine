import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'entrypoint.js',
    'app.config.ts',
    'babel.config.js',
    'metro.config.js',
    'tailwind.config.js',
    // expo-router discovers route files by convention; knip cannot trace them.
    'src/app/**/*.{ts,tsx}',
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
    '@privy-io/expo',
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
    // T6 native wallet backend dependency; installed before the provider import
    // to keep the dev-client graph stable across the screen migration.
    'viem',
    // expo-router runtime requirements, never imported directly.
    'react-native-safe-area-context',
    'react-native-screens',
    // Consumed by nativewind's tailwind pipeline, not imported from code.
    'tailwindcss',
    // babel jsxImportSource emits react-native-css-interop/jsx-runtime
    // imports; pnpm's strict node_modules needs it as a direct dependency.
    'react-native-css-interop',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
