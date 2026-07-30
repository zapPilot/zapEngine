import path from 'node:path';

import { getConfig } from 'expo/config';
import { compileModsAsync } from 'expo/config-plugins';
import { describe, expect, it } from 'vitest';

import appConfig, { resolveExpoAlchemyApiKey } from '../app.config';

function pluginName(plugin: unknown): unknown {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

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

  it('prefers Expo Alchemy config and falls back to the local Vite key', () => {
    expect(
      resolveExpoAlchemyApiKey({
        EXPO_PUBLIC_ALCHEMY_API_KEY: 'expo-key',
        VITE_ALCHEMY_API_KEY: 'vite-key',
      }),
    ).toBe('expo-key');
    expect(
      resolveExpoAlchemyApiKey({
        EXPO_PUBLIC_ALCHEMY_API_KEY: '',
        VITE_ALCHEMY_API_KEY: 'vite-key',
      }),
    ).toBe('vite-key');
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
