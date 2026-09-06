import path from 'node:path';

import { getConfig } from 'expo/config';
import { compileModsAsync } from 'expo/config-plugins';
import { describe, expect, it, vi } from 'vitest';

import { projectEnv } from '../../../scripts/env/lib.mjs';
import appConfig, { shouldEnableDevClientPlugin } from '../app.config';

function pluginName(plugin: unknown): unknown {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

describe('store identity', () => {
  // Both stores continue the retired Flutter app's listings rather than opening
  // new records: Google Play under com.fromfedtochain.app, App Store under
  // com.example.fromFedToChainApp (ASC app 6749248542). Only the user-facing
  // name changed.
  it('preserves the existing store applications while using the Zap Pilot name', () => {
    expect(appConfig.name).toBe('Zap Pilot');
    expect(appConfig.android?.package).toBe('com.fromfedtochain.app');
    expect(appConfig.ios?.bundleIdentifier).toBe(
      'com.example.fromFedToChainApp',
    );
  });

  it('keeps the native identifiers registered with the Privy mobile client', () => {
    expect(appConfig.android?.package).toBe('com.fromfedtochain.app');
    expect(appConfig.ios?.bundleIdentifier).toBe(
      'com.example.fromFedToChainApp',
    );
    expect(appConfig.scheme).toBe('zappilotv2');
  });

  // The shipped listing is on 2.03, which Apple reads as major 2, minor 3.
  // Anything on the 2.1.x line would be a downgrade, so the rewrite takes the
  // major bump it had earned anyway.
  it('outranks the version the Flutter app left on the App Store', () => {
    expect(appConfig.version).toBe('3.0.0');
    expect(appConfig.android?.versionCode).toBeUndefined();
  });

  it('launches development clients against the shared Metro server', () => {
    expect(appConfig.plugins).toContainEqual([
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
    ]);
  });

  it('keeps video playback foreground-only without picture-in-picture', () => {
    expect(appConfig.plugins).toContainEqual([
      'expo-video',
      {
        supportsBackgroundPlayback: false,
        supportsPictureInPicture: false,
      },
    ]);
  });

  it('enables background podcast audio via the expo-audio plugin', () => {
    expect(appConfig.plugins).toContainEqual([
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: true,
      },
    ]);
  });

  it('configures Sentry native support without source-map uploads', () => {
    expect(appConfig.plugins).toContainEqual([
      '@sentry/react-native/expo',
      { disableAutoUpload: true },
    ]);
  });

  it('lists expo-audio before expo-video so the background-audio Info.plist mod wins', () => {
    // @expo/config-plugins runs each mod chain in REVERSE registration order:
    // the plugin listed FIRST runs LAST and owns the final value. expo-video
    // (supportsBackgroundPlayback: false) strips 'audio' from UIBackgroundModes,
    // so expo-audio must precede it or background playback is silently disabled.
    const names = (appConfig.plugins ?? []).map(pluginName);
    const audioIndex = names.indexOf('expo-audio');
    const videoIndex = names.indexOf('expo-video');
    expect(audioIndex).toBeGreaterThanOrEqual(0);
    expect(videoIndex).toBeGreaterThanOrEqual(0);
    expect(audioIndex).toBeLessThan(videoIndex);
  });

  it('projects canonical values to Expo names', () => {
    expect(
      projectEnv(
        {
          ACCOUNT_API_URL: 'http://localhost:3004',
          PRIVY_MOBILE_APP_ID: 'mobile-app',
          PRIVY_MOBILE_CLIENT_ID: 'mobile-client',
        },
        'expo',
      ),
    ).toMatchObject({
      EXPO_PUBLIC_ACCOUNT_API_URL: 'http://localhost:3004',
      EXPO_PUBLIC_PRIVY_APP_ID: 'mobile-app',
      EXPO_PUBLIC_PRIVY_CLIENT_ID: 'mobile-client',
    });
  });
});

describe('App Store submission config', () => {
  it('enables the dev-client plugin outside of the production build profile', () => {
    expect(shouldEnableDevClientPlugin({})).toBe(true);
    expect(shouldEnableDevClientPlugin({ EAS_BUILD_PROFILE: 'preview' })).toBe(
      true,
    );
  });

  it('disables the dev-client plugin for the production build profile', () => {
    expect(
      shouldEnableDevClientPlugin({ EAS_BUILD_PROFILE: 'production' }),
    ).toBe(false);
  });

  it('omits expo-dev-client from the plugin list for a production build', async () => {
    vi.resetModules();
    process.env.EAS_BUILD_PROFILE = 'production';
    try {
      const { default: productionConfig } = await import('../app.config');
      const names = (productionConfig.plugins ?? []).map(pluginName);
      expect(names).not.toContain('expo-dev-client');
    } finally {
      delete process.env.EAS_BUILD_PROFILE;
      vi.resetModules();
    }
  });

  it('declares no export-compliance encryption to avoid manual App Store review', () => {
    expect(appConfig.ios?.config?.usesNonExemptEncryption).toBe(false);
  });

  it('declares collected email data to match the Privy auth flow', () => {
    const collectedTypes =
      appConfig.ios?.privacyManifests?.NSPrivacyCollectedDataTypes ?? [];
    expect(collectedTypes).toContainEqual({
      NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
      NSPrivacyCollectedDataTypeLinked: true,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: [
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      ],
    });
  });
});

describe('evaluated native config (plugin end-state)', () => {
  it('keeps "audio" in UIBackgroundModes after all config plugins run', async () => {
    // Same pipeline as `expo config --type introspect`: evaluates every
    // plugin's Info.plist mods against in-memory templates without touching
    // native files. This asserts the value prebuild will actually write, so
    // it fails no matter which plugin/order regression drops background audio.
    const projectRoot = path.resolve(__dirname, '..');
    const { exp } = getConfig(projectRoot, {
      skipSDKVersionRequirement: true,
      isModdedConfig: true,
    });
    const modded = await compileModsAsync(exp, {
      projectRoot,
      introspect: true,
      platforms: ['ios'],
      assertMissingModProviders: false,
    });
    expect(modded.ios?.infoPlist?.UIBackgroundModes).toContain('audio');
  }, 30_000);
});
