import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAppCoreEnvSource } from '../src/config/appCoreEnv';

describe('buildAppCoreEnvSource', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps EXPO_PUBLIC_* values onto the VITE_* keys app-core reads', () => {
    vi.stubEnv('EXPO_PUBLIC_ACCOUNT_API_URL', 'https://account.example');
    vi.stubEnv('EXPO_PUBLIC_ANALYTICS_ENGINE_URL', 'https://analytics.example');
    vi.stubEnv('EXPO_PUBLIC_PRIVY_APP_ID', 'privy-app');
    vi.stubEnv('EXPO_PUBLIC_PRIVY_CLIENT_ID', 'privy-client');
    vi.stubEnv('EXPO_PUBLIC_ALCHEMY_API_KEY', 'alchemy-key');
    vi.stubEnv('EXPO_PUBLIC_MORALIS_API_KEY', 'moralis-key');
    vi.stubEnv('EXPO_PUBLIC_PODCAST_API_URL', 'https://podcast.example');
    vi.stubEnv('EXPO_PUBLIC_WALLET_TOKEN_PROVIDER', 'alchemy');

    expect(buildAppCoreEnvSource()).toMatchObject({
      VITE_ACCOUNT_API_URL: 'https://account.example',
      VITE_ANALYTICS_ENGINE_URL: 'https://analytics.example',
      VITE_PRIVY_APP_ID: 'privy-app',
      VITE_PRIVY_CLIENT_ID: 'privy-client',
      VITE_ALCHEMY_API_KEY: 'alchemy-key',
      VITE_MORALIS_API_KEY: 'moralis-key',
      VITE_PODCAST_API_URL: 'https://podcast.example',
      VITE_DESKTOP_WALLET_PROVIDER: 'alchemy',
    });
  });

  it('always reports the native app runtime', () => {
    expect(buildAppCoreEnvSource().VITE_APP_RUNTIME).toBe('native');
  });

  it('derives MODE from the __DEV__ build flag', () => {
    // vitest runs in node where __DEV__ is undefined -> production
    expect(buildAppCoreEnvSource().MODE).toBe('production');

    vi.stubGlobal('__DEV__', true);
    expect(buildAppCoreEnvSource().MODE).toBe('development');
  });
});
