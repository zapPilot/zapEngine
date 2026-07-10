import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  entry: [
    'entrypoint.js',
    'app.config.ts',
    'babel.config.js',
    'metro.config.js',
    'playwright.config.ts',
    'tailwind.config.js',
    'scripts/check-web-native-leaks.mjs',
    'scripts/serve-web.mjs',
    // expo-router discovers route files by convention; knip cannot trace them.
    'src/app/**/*.{ts,tsx}',
    // Metro resolves platform suffixes (.web) at bundle time, not through
    // imports that knip can trace from the native graph.
    'src/**/*.web.{ts,tsx}',
    'tests/**/*.test.ts',
    'tests/e2e/**/*.spec.ts',
  ],
  project: [
    'scripts/**/*.mjs',
    'src/**/*.{ts,tsx}',
    'tests/**/*.ts',
    'app.config.ts',
    'playwright.config.ts',
    'vitest.config.ts',
  ],
  ignoreDependencies: [
    '@expo/metro-config',
    '@expo/metro-runtime',
    // Referenced from babel.config.js by preset name for Expo's Metro/Babel pipeline.
    'babel-preset-expo',
    '@privy-io/expo',
    '@privy-io/expo-native-extensions',
    '@privy-io/react-auth',
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
    'hls.js',
    'react-native-passkeys',
    'react-native-web',
    'react-native-webview',
    // Babel resolves react-native-worklets/plugin during Metro bundling.
    'react-native-worklets',
    // T6 native wallet backend dependency; installed before the provider import
    // to keep the dev-client graph stable across the screen migration.
    'viem',
    // Web/desktop external-wallet SDK consumed entirely through
    // @zapengine/app-core (config/wagmi, useWagmiWalletBackend, Web3Provider);
    // apps/app never imports it directly, but pnpm's strict node_modules
    // needs it declared here to resolve inside app-core's peer chain.
    'wagmi',
    // expo-router runtime requirements, never imported directly.
    'react-native-safe-area-context',
    'react-native-screens',
    // Consumed by nativewind's tailwind pipeline, not imported from code.
    'tailwindcss',
    // Referenced by string name in babel.config.js presets; knip cannot trace it.
    'babel-preset-expo',
    // babel jsxImportSource emits react-native-css-interop/jsx-runtime
    // imports; pnpm's strict node_modules needs it as a direct dependency.
    'react-native-css-interop',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['tests/**/*.test.ts'],
  },
});
