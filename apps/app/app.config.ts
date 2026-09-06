import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import { loadEnvFile, mergeEnv, projectEnv } from '../../scripts/env/lib.mjs';

const repoRootEnv = path.resolve(__dirname, '../../.env');
const canonicalEnv = mergeEnv(loadEnvFile(repoRootEnv).values, process.env);
Object.assign(process.env, canonicalEnv, projectEnv(canonicalEnv, 'expo'));

/**
 * expo-dev-client wires a local-network dev-server launcher into the app
 * (NSLocalNetworkUsageDescription, NSBonjourServices, an ATS exception for
 * localhost:8081). That plugin has no place in a production store build.
 */
export function shouldEnableDevClientPlugin(
  env: Record<string, string | undefined>,
): boolean {
  return env.EAS_BUILD_PROFILE !== 'production';
}

const devClientPlugin: [string, Record<string, unknown>] = [
  'expo-dev-client',
  {
    android: {
      launchMode: 'most-recent',
      defaultLaunchURL: 'http://10.0.2.2:8081',
    },
    ios: {
      launchMode: 'most-recent',
      defaultLaunchURL: 'http://localhost:8081',
    },
  },
];

const appScheme = 'zappilotv2';

const config: ExpoConfig = {
  name: 'Zap Pilot',
  slug: 'zap-pilot-mobile-v2',
  owner: 'davidtnfsh',
  scheme: appScheme,
  version: '2.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/brand/icon.png',
  ios: {
    // Bound to the shipped App Store listing (ASC app 6749248542), which the
    // retired Flutter app created and Apple has already approved. The
    // `com.example.` prefix is that app's permanent identifier and cannot be
    // changed on an existing record. Android preserves the same lineage under
    // `com.fromfedtochain.app`.
    bundleIdentifier: 'com.example.fromFedToChainApp',
    supportsTablet: false,
    icon: './assets/brand/icon.png',
    config: {
      usesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          ],
        },
      ],
    },
  },
  android: {
    package: 'com.fromfedtochain.app',
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/favicon.png',
  },
  plugins: [
    './scripts/with-app-store-icon.cjs',
    [
      '@sentry/react-native/expo',
      {
        disableAutoUpload: true,
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          buildReactNativeFromSource: true,
        },
      },
    ],
    ...(shouldEnableDevClientPlugin(process.env) ? [devClientPlugin] : []),
    'expo-router',
    [
      'expo-secure-store',
      {
        faceIDPermission:
          'Use Face ID to unlock your signed-in Zap Pilot session on this device.',
      },
    ],
    [
      // Background audio + lock-screen controls for podcast playback. This is an
      // audio-playback-only app, so recording/microphone permissions are
      // explicitly disabled (recordAudioAndroid defaults to true otherwise).
      //
      // ORDER MATTERS — expo-audio must stay ABOVE expo-video. @expo/config-plugins
      // executes each mod chain in REVERSE array order (the plugin listed first
      // runs last and owns the final Info.plist value). expo-video's plugin, with
      // supportsBackgroundPlayback: false, actively REMOVES 'audio' from
      // UIBackgroundModes; expo-audio's plugin adds it. Listed the other way
      // round, expo-video runs last and background playback silently dies.
      // Guarded by tests/appConfig.test.ts.
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: true,
      },
    ],
    [
      // Video stays foreground-only (product decision). Keep this entry BELOW
      // expo-audio — see the ordering note above.
      'expo-video',
      {
        supportsBackgroundPlayback: false,
        supportsPictureInPicture: false,
      },
    ],
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/brand/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#0a0a0a',
      },
    ],
  ],
  extra: {
    appRuntime: 'app',
    // Canonical values are projected before Expo evaluates this config.
    alchemyApiKey: process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '',
    privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
    privyWebAppId: canonicalEnv.PRIVY_WEB_APP_ID ?? '',
    privyMobileAppId: canonicalEnv.PRIVY_MOBILE_APP_ID ?? '',
    privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
    eas: {
      projectId: 'c20d048d-5e94-447b-b95d-dfb7fc30e23d',
    },
  },
};

export default config;
