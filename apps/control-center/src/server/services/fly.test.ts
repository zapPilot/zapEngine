import type {
  CostSnapshot,
  CostUsageItem,
} from '@zapengine/cost-observability';
import { describe, expect, it, vi } from 'vitest';

import { FLY_RUN_RATE_USAGE_KEY } from '../../shared/types.js';
import { fetchFlyRunRateSnapshot, type FlyctlRunner } from './fly.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

interface FakeMachine {
  state: string;
  cpuKind: string;
  cpus: number;
  memoryMb: number;
}

/**
 * Stands in for the two reads the collector makes — `apps list`, then
 * `machine list` per app — keyed by app name so each case can describe a fleet
 * instead of branching on argv.
 */
function flyctlStub(fleet: Record<string, FakeMachine[]>): FlyctlRunner {
  return vi.fn((args: string[]) => {
    if (args[0] === 'apps') {
      return Promise.resolve(
        JSON.stringify(Object.keys(fleet).map((Name) => ({ Name }))),
      );
    }
    const machines = args.flatMap((arg) => fleet[arg] ?? []);
    const rows = machines.map((machine) => ({
      state: machine.state,
      region: 'iad',
      config: {
        guest: {
          cpu_kind: machine.cpuKind,
          cpus: machine.cpus,
          memory_mb: machine.memoryMb,
        },
      },
    }));
    return Promise.resolve(JSON.stringify(rows));
  });
}

/** `shared-cpu-1x` carrying 0.25 GB more RAM than its allowance covers. */
function sharedCpu1x(state: FakeMachine['state']): FakeMachine {
  return { state, cpuKind: 'shared', cpus: 1, memoryMb: 512 };
}

/** `performance-2x` carrying exactly the 4 GB its two vCPUs already include. */
function performance2x(state: FakeMachine['state']): FakeMachine {
  return { state, cpuKind: 'performance', cpus: 2, memoryMb: 4096 };
}

function runRate(snapshot: CostSnapshot): CostUsageItem | undefined {
  return snapshot.usage.find((item) => item.key === FLY_RUN_RATE_USAGE_KEY);
}

describe('fetchFlyRunRateSnapshot', () => {
  it('never reports a theoretical run-rate as accrued or projected cost', async () => {
    const snapshot = await fetchFlyRunRateSnapshot({
      now: NOW,
      run: flyctlStub({
        render: [performance2x('started')],
        api: [sharedCpu1x('started')],
      }),
    });

    // performance-2x: 2 x $32.19, and 4096 MB is exactly the 2 x 2 GB included,
    // so no extra RAM = $64.38. shared-cpu-1x: 1 x $2.02 plus the 0.25 GB over
    // its 0.25 GB allowance at $5.20 = $3.32. Together they are the $67.70 the
    // dashboard used to publish as a month-end projection against a ~$14 bill.
    expect(runRate(snapshot)?.value).toBe(67.7);
    expect(snapshot.accruedCostUsd).toBeNull();
    expect(snapshot.projectedCostUsd).toBeNull();
    expect(runRate(snapshot)?.label).toMatch(/not billed/);
  });

  it('counts stopped Machines without pricing them', async () => {
    const snapshot = await fetchFlyRunRateSnapshot({
      now: NOW,
      run: flyctlStub({
        api: [sharedCpu1x('started')],
        render: [performance2x('stopped')],
      }),
    });

    expect(runRate(snapshot)?.value).toBe(3.32);
    expect(snapshot.accruedCostUsd).toBeNull();
    expect(snapshot.projectedCostUsd).toBeNull();
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'running_machines', value: 1 }),
        expect.objectContaining({ key: 'stopped_machines', value: 1 }),
        expect.objectContaining({ key: 'apps', value: 2 }),
      ]),
    );
  });

  it('reports a zero run-rate when nothing is started', async () => {
    const idle = await fetchFlyRunRateSnapshot({
      now: NOW,
      run: flyctlStub({ render: [performance2x('stopped')] }),
    });
    const empty = await fetchFlyRunRateSnapshot({
      now: NOW,
      run: flyctlStub({}),
    });

    expect(runRate(idle)?.value).toBe(0);
    expect(idle.accruedCostUsd).toBeNull();
    expect(idle.projectedCostUsd).toBeNull();
    expect(runRate(empty)?.value).toBe(0);
    expect(empty.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'apps', value: 0 }),
      ]),
    );
  });

  it('throws when no started Machine can be priced', async () => {
    const run = flyctlStub({
      gpu: [{ state: 'started', cpuKind: 'gpu', cpus: 8, memoryMb: 32768 }],
    });

    await expect(fetchFlyRunRateSnapshot({ now: NOW, run })).rejects.toThrow(
      /unsupported resource shapes/,
    );
  });
});
