import { describe, expect, it, vi } from 'vitest';

import { FLY_RUN_RATE_USAGE_KEY } from '../../shared/types.js';
import { fetchFlyRunRateSnapshot } from './fly.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

vi.mock('./flyctl.js', () => ({
  runFlyctl: vi.fn(() => Promise.resolve(JSON.stringify([]))),
}));

import { runFlyctl } from './flyctl.js';

describe('fly collector coverage gaps', () => {
  it('skips apps without a usable name', async () => {
    const run = vi.fn((args: string[]) => {
      if (args[0] === 'apps') {
        return Promise.resolve(
          JSON.stringify([{ Name: '  ' }, {}, { Name: 'api' }]),
        );
      }
      if (args.includes('api')) {
        return Promise.resolve(
          JSON.stringify([
            {
              state: 'started',
              config: {
                guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 256 },
              },
            },
          ]),
        );
      }
      return Promise.resolve(JSON.stringify([]));
    });

    const snapshot = await fetchFlyRunRateSnapshot({ now: NOW, run });
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'apps', value: 1 }),
      ]),
    );
    expect(
      snapshot.usage.find((item) => item.key === 'running_machines')?.value,
    ).toBe(1);
  });

  it('treats Machines with missing guest shapes as unpriced but keeps the priced ones', async () => {
    const run = vi.fn((args: string[]) => {
      if (args[0] === 'apps') {
        return Promise.resolve(JSON.stringify([{ Name: 'api' }]));
      }
      return Promise.resolve(
        JSON.stringify([
          {
            state: 'started',
            config: { guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 } },
          },
          { state: 'started', config: {} },
          { state: 'started' },
        ]),
      );
    });

    const snapshot = await fetchFlyRunRateSnapshot({ now: NOW, run });
    // One priced shared-cpu-1x/512MB ($3.32) plus two unpriced Machines.
    expect(
      snapshot.usage.find((item) => item.key === 'unsupported_running_machines')
        ?.value,
    ).toBe(2);
    expect(
      snapshot.usage.find((item) => item.key === FLY_RUN_RATE_USAGE_KEY)?.value,
    ).toBe(3.32);
  });

  it('rejects a non-array flyctl payload', async () => {
    const run = vi.fn(() => Promise.resolve(JSON.stringify({ apps: [] })));

    await expect(fetchFlyRunRateSnapshot({ now: NOW, run })).rejects.toThrow(
      'flyctl returned invalid JSON',
    );
  });

  it('uses the default flyctl runner when none is injected', async () => {
    vi.mocked(runFlyctl).mockResolvedValueOnce(JSON.stringify([]));

    const snapshot = await fetchFlyRunRateSnapshot({ now: NOW });
    expect(runFlyctl).toHaveBeenCalledWith(['apps', 'list', '--json']);
    expect(snapshot.accruedCostUsd).toBeNull();
  });
});
