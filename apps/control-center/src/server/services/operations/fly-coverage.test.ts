import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import type { FlyMachine } from './fly-client.js';
import { collectFlySignals } from './fly.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');
const TOKEN_CONFIG = readControlCenterConfig({ FLY_OPS_TOKEN: 'fly-token' });

function machine(overrides: Partial<FlyMachine> = {}): FlyMachine {
  return {
    id: 'm1',
    name: null,
    state: 'started',
    region: 'iad',
    processGroup: null,
    instanceId: null,
    createdAt: '2026-08-28T08:00:00.000Z',
    updatedAt: '2026-08-28T08:30:00.000Z',
    image: null,
    events: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fly coverage', () => {
  it('builds its own client from the token when no client is injected', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        {
          id: 'm1',
          state: 'started',
          region: 'iad',
          config: { metadata: {} },
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchImpl);

    const signals = await collectFlySignals({ config: TOKEN_CONFIG, now: NOW });

    expect(fetchImpl).toHaveBeenCalled();
    expect(
      signals.find((signal) => signal.fingerprint === 'fly:app/account-engine')
        ?.status,
    ).toBe('healthy');
  });

  it('omits a null region from the region list', async () => {
    const signals = await collectFlySignals({
      config: readControlCenterConfig({}),
      now: NOW,
      client: {
        listMachines: async (app: string) => {
          if (app === 'account-engine') {
            return [machine({ region: null })];
          }
          return [machine({})];
        },
      },
    });

    const target = signals.find(
      (signal) => signal.fingerprint === 'fly:app/account-engine',
    );
    expect(target?.evidence['regions']).toBe('');
    expect(target?.status).toBe('healthy');
  });

  it('reports null age when stopped machines carry no parseable timestamp', async () => {
    const signals = await collectFlySignals({
      config: readControlCenterConfig({}),
      now: NOW,
      client: {
        listMachines: async (app: string) => {
          if (app === 'account-engine') {
            return [
              machine({
                state: 'stopped',
                updatedAt: null,
                createdAt: null,
              }),
            ];
          }
          return [machine({})];
        },
      },
    });

    const target = signals.find(
      (signal) => signal.fingerprint === 'fly:app/account-engine',
    );
    expect(target?.status).toBe('healthy');
    expect(target?.detail).toContain('resting state');
    expect(target?.evidence['criticalSinceMinutes']).toBeNull();
  });
});
