import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

function loadRepoRootEnv(): void {
  const repoRootEnv = path.resolve(__dirname, '../../.env');

  if (!existsSync(repoRootEnv)) {
    return;
  }

  for (const line of readFileSync(repoRootEnv, 'utf8').split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?\s*$/u.exec(line);

    if (!match) {
      continue;
    }

    const key = match[1];

    if (!key) {
      continue;
    }

    const rawValue = match[2] ?? '';
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/u, '$2');

    process.env[key] ??= value;
  }
}

loadRepoRootEnv();

export function resolveExpoAlchemyApiKey(
  env: Record<string, string | undefined>,
): string {
  return (
    env.EXPO_PUBLIC_ALCHEMY_API_KEY?.trim() ||
    env.VITE_ALCHEMY_API_KEY?.trim() ||
    ''
  );
}

process.env.EXPO_PUBLIC_ALCHEMY_API_KEY = resolveExpoAlchemyApiKey(process.env);

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
    bundleIdentifier: 'com.zapengine.zappilot.dev',
    supportsTablet: false,
    icon: './assets/brand/icon.png',
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
      'expo-build-properties',
      {
        ios: {
          buildReactNativeFromSource: true,
        },
      },
    ],
    [
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
    ],
    'expo-router',
    'expo-secure-store',
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
    // EXPO_PUBLIC_* remains canonical for deployed builds. VITE_* is a local
    // repo fallback so Expo can share the already-configured Alchemy key.
    alchemyApiKey: process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? '',
    privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
    privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
    eas: {
      projectId: 'c20d048d-5e94-447b-b95d-dfb7fc30e23d',
    },
  },
};

export default config;
