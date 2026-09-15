import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getExpoMobileRuntimeConfig,
  readExpoExtra,
} from '@/config/expoRuntimeConfig';

const constants = vi.hoisted(() => ({
  expoConfig: null as null | { extra?: Record<string, unknown> },
}));

vi.mock('expo-constants', () => ({ default: constants }));

beforeEach(() => {
  constants.expoConfig = null;
  delete process.env.EXPO_PUBLIC_PRIVY_APP_ID;
  delete process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_PRIVY_APP_ID;
  delete process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
});

describe('Expo runtime config', () => {
  it('returns empty extra config when neither manifest nor env has values', () => {
    expect(readExpoExtra()).toEqual({});
    expect(getExpoMobileRuntimeConfig()).toEqual({
      runtime: 'app',
      privy: null,
    });
  });

  it('prefers manifest extra values while preserving unrelated entries', () => {
    process.env.EXPO_PUBLIC_PRIVY_APP_ID = 'env-app';
    process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID = 'env-client';
    constants.expoConfig = {
      extra: {
        privyAppId: 'extra-app',
        privyClientId: 'extra-client',
        accountApiUrl: 'https://account.example',
      },
    };

    expect(readExpoExtra()).toEqual({
      privyAppId: 'extra-app',
      privyClientId: 'extra-client',
      accountApiUrl: 'https://account.example',
    });
    expect(getExpoMobileRuntimeConfig()).toMatchObject({
      privy: { appId: 'extra-app', clientId: 'extra-client' },
    });
  });

  it('fills each missing credential independently from public env', () => {
    process.env.EXPO_PUBLIC_PRIVY_APP_ID = 'env-app';
    process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID = 'env-client';
    constants.expoConfig = { extra: { privyAppId: '', privyClientId: null } };

    expect(readExpoExtra()).toMatchObject({
      privyAppId: 'env-app',
      privyClientId: 'env-client',
    });
  });
});
