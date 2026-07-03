import type { ExpoConfig } from 'expo/config';

const appScheme = 'zappilotv2';

const config: ExpoConfig = {
  name: 'Zap Pilot Mobile V2',
  slug: 'zap-pilot-mobile-v2',
  scheme: appScheme,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.zapengine.zappilot.dev',
    supportsTablet: false,
  },
  android: {
    package: 'com.zapengine.zappilot.dev',
  },
  plugins: [
    'expo-dev-client',
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
  ],
  extra: {
    appRuntime: 'mobile-v2',
    privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
    privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
  },
};

export default config;
