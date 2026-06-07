import { afterEach, describe, expect, it } from 'vitest';

import { getZeroDevConfig } from '@/lib/env/zerodev';

const ZERO_DEV_PROJECT_ID = '61016d2a-e0df-4350-929c-d5f2110700d1';

function stashEnv(key: string): {
  restore: () => void;
} {
  const originalMeta = (import.meta.env as Record<string, unknown>)[key];
  const originalProcess = process.env[key];

  return {
    restore: () => {
      if (originalMeta === undefined) {
        Reflect.deleteProperty(import.meta.env, key);
      } else {
        (import.meta.env as Record<string, unknown>)[key] = originalMeta;
      }

      if (originalProcess === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = originalProcess;
      }
    },
  };
}

describe('getZeroDevConfig', () => {
  const envKeys = [
    'VITE_ZERODEV_PROJECT_ID',
    'ZERODEV_PROJECT_ID',
    'VITE_ZERODEV_BUNDLER_RPC',
    'VITE_ZERODEV_PAYMASTER_RPC',
  ];
  const stashes = envKeys.map(stashEnv);

  afterEach(() => {
    for (const stash of stashes) {
      stash.restore();
    }
  });

  it('builds the ZeroDev v3 RPC from the frontend project id and chain id', () => {
    (import.meta.env as Record<string, unknown>)['VITE_ZERODEV_PROJECT_ID'] =
      ZERO_DEV_PROJECT_ID;

    expect(getZeroDevConfig(42161)).toEqual({
      projectId: ZERO_DEV_PROJECT_ID,
      rpc: `https://rpc.zerodev.app/api/v3/${ZERO_DEV_PROJECT_ID}/chain/42161`,
    });
  });

  it('falls back to the unprefixed project id for node-side tests only', () => {
    Reflect.deleteProperty(import.meta.env, 'VITE_ZERODEV_PROJECT_ID');
    process.env['ZERODEV_PROJECT_ID'] = ZERO_DEV_PROJECT_ID;

    expect(getZeroDevConfig(8453)).toEqual({
      projectId: ZERO_DEV_PROJECT_ID,
      rpc: `https://rpc.zerodev.app/api/v3/${ZERO_DEV_PROJECT_ID}/chain/8453`,
    });
  });

  it('does not accept the legacy bundler RPC setting without a project id', () => {
    (import.meta.env as Record<string, unknown>)['VITE_ZERODEV_BUNDLER_RPC'] =
      `https://rpc.zerodev.app/api/v2/bundler/${ZERO_DEV_PROJECT_ID}`;

    expect(() => getZeroDevConfig(42161)).toThrow(
      'Missing VITE_ZERODEV_PROJECT_ID',
    );
  });
});
