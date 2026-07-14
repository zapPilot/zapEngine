import { describe, expect, it } from 'vitest';

import appConfig from '../app.config';

describe('Android store identity', () => {
  it('preserves the existing Google Play application while using the Zap Pilot name', () => {
    expect(appConfig.name).toBe('Zap Pilot');
    expect(appConfig.android?.package).toBe('com.fromfedtochain.app');
  });

  it('keeps the native identifiers registered with the Privy mobile client', () => {
    expect(appConfig.android?.package).toBe('com.fromfedtochain.app');
    expect(appConfig.ios?.bundleIdentifier).toBe('com.zapengine.zappilot.dev');
    expect(appConfig.scheme).toBe('zappilotv2');
  });

  it('uses the next user-facing version after the final Flutter release', () => {
    expect(appConfig.version).toBe('2.1.0');
    expect(appConfig.android?.versionCode).toBeUndefined();
  });

  it('launches the Android development client against the emulator Metro server', () => {
    expect(appConfig.plugins).toContainEqual([
      'expo-dev-client',
      {
        android: {
          launchMode: 'most-recent',
          defaultLaunchURL: 'http://10.0.2.2:8081',
        },
      },
    ]);
  });
});
