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
    [
      'expo-dev-client',
      {
        android: {
          launchMode: 'most-recent',
          defaultLaunchURL: 'http://10.0.2.2:8081',
        },
      },
    ],
    'expo-router',
    'expo-secure-store',
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
    privyAppId: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
    privyClientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
    eas: {
      projectId: 'c20d048d-5e94-447b-b95d-dfb7fc30e23d',
    },
  },
};

export default config;
