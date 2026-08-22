import { describe, expect, it, vi } from 'vitest';

import { fetchFlyRunRateSnapshot } from './fly.js';

describe('fetchFlyRunRateSnapshot', () => {
  it('estimates the current monthly compute run-rate from started Machines', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'apps') {
        return JSON.stringify([{ Name: 'api' }, { Name: 'worker' }]);
      }
      if (args.includes('api')) {
        return JSON.stringify([
          {
            state: 'started',
            region: 'iad',
            config: {
              guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 },
            },
          },
        ]);
      }
      return JSON.stringify([
        {
          state: 'stopped',
          region: 'iad',
          config: {
            guest: { cpu_kind: 'performance', cpus: 2, memory_mb: 4096 },
          },
        },
      ]);
    });

    const snapshot = await fetchFlyRunRateSnapshot({
      now: new Date('2026-08-22T12:00:00.000Z'),
      run,
    });

    expect(snapshot.accruedCostUsd).toBeNull();
    expect(snapshot.projectedCostUsd).toBe(3.32);
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'running_machines', value: 1 }),
        expect.objectContaining({ key: 'stopped_machines', value: 1 }),
        expect.objectContaining({ key: 'apps', value: 2 }),
      ]),
    );
  });
});
