import type { CostSnapshot } from '@zapengine/cost-observability';

import { FLY_RUN_RATE_USAGE_KEY } from '../../shared/types.js';
import { runFlyctl } from './flyctl.js';

const REFERENCE_SHARED_CPU_MONTHLY_USD = 2.02;
const REFERENCE_PERFORMANCE_CPU_MONTHLY_USD = 32.19;
const REFERENCE_EXTRA_RAM_GB_MONTHLY_USD = 5.2;

export type FlyctlRunner = (args: string[]) => Promise<string>;

interface FlyAppRow {
  Name?: string;
  Status?: string;
}

interface FlyMachineRow {
  state?: string;
  region?: string;
  config?: {
    guest?: {
      cpu_kind?: string;
      cpus?: number;
      memory_mb?: number;
    };
  };
}

/**
 * A compute census, deliberately not a bill.
 *
 * Fly publishes no billing or usage API — `flyctl` only offers `dashboard`,
 * which opens a browser — so nothing in this process can observe what Fly will
 * invoice. What it can observe is the fleet: `apps list` plus `machine list`
 * per app, priced at published list rates. That product is a saturation
 * ceiling, and reporting it as a projection is how the dashboard came to claim
 * $67.70 against a real bill near $14:
 *
 * - Fly bills per second, while this is an instantaneous census of Machines in
 *   state `started` multiplied by a whole month.
 * - The podcast render group is on-demand. A performance-2x that is up for the
 *   few minutes one episode takes reads here as $64.38/month purely because it
 *   happened to be alive when the collector ran.
 * - Stopped Machines keep only their rootfs, billed at $0.15/GB/month, so a
 *   fleet that is mostly idle costs a rounding error of what this sums.
 *
 * So both cost fields stay null and the sum is filed under
 * `FLY_RUN_RATE_USAGE_KEY` as evidence about capacity. Fly reaches
 * `projectedCostUsd` only through an operator reading the Fly dashboard and
 * recording it with `ops:cost snapshot fly <usd>`.
 */
export async function fetchFlyRunRateSnapshot(input: {
  now: Date;
  run?: FlyctlRunner;
}): Promise<CostSnapshot> {
  const run = input.run ?? runFlyctl;
  const apps = parseArray<FlyAppRow>(await run(['apps', 'list', '--json']));
  const appNames = apps.flatMap((app) =>
    typeof app.Name === 'string' && app.Name.trim() ? [app.Name] : [],
  );
  const machines = (
    await Promise.all(
      appNames.map(async (appName) => ({
        appName,
        rows: parseArray<FlyMachineRow>(
          await run(['machine', 'list', '--app', appName, '--json']),
        ),
      })),
    )
  ).flatMap(({ appName, rows }) => rows.map((row) => ({ appName, row })));

  const started = machines.filter(({ row }) => row.state === 'started');
  const stopped = machines.filter(({ row }) => row.state !== 'started');
  let monthlyRunRateUsd = 0;
  let unsupportedStarted = 0;
  for (const { row } of started) {
    const estimate = estimateMachineMonthlyUsd(row);
    if (estimate === null) {
      unsupportedStarted += 1;
      continue;
    }
    monthlyRunRateUsd += estimate;
  }
  // A running fleet none of whose shapes can be priced would otherwise persist
  // a $0 run-rate that reads exactly like an idle fleet, so fail loudly and let
  // the sync report the provider as broken.
  if (started.length > 0 && unsupportedStarted === started.length) {
    throw new Error('Fly.io started Machines use unsupported resource shapes');
  }

  const monthStart = new Date(
    Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1),
  );
  return {
    provider: 'fly',
    periodStart: monthStart.toISOString(),
    periodEnd: input.now.toISOString(),
    accruedCostUsd: null,
    projectedCostUsd: null,
    costType: 'estimated',
    source: 'api',
    usage: [
      {
        key: FLY_RUN_RATE_USAGE_KEY,
        unit: 'usd',
        label:
          'Compute run-rate if every running Machine stayed up all month ' +
          '(list price, not billed)',
        value: roundUsd(monthlyRunRateUsd),
      },
      {
        key: 'running_machines',
        unit: 'units',
        label: 'Running Machines',
        value: started.length,
      },
      {
        key: 'stopped_machines',
        unit: 'units',
        label: 'Stopped Machines',
        value: stopped.length,
      },
      {
        key: 'apps',
        unit: 'units',
        label: 'Fly apps',
        value: appNames.length,
      },
      ...(unsupportedStarted
        ? [
            {
              key: 'unsupported_running_machines',
              unit: 'units' as const,
              label: 'Unpriced running Machines',
              value: unsupportedStarted,
            },
          ]
        : []),
    ],
    fetchedAt: input.now.toISOString(),
  };
}

function estimateMachineMonthlyUsd(machine: FlyMachineRow): number | null {
  const guest = machine.config?.guest;
  const cpus = guest?.cpus;
  const memoryMb = guest?.memory_mb;
  if (!cpus || !memoryMb) {
    return null;
  }

  if (guest.cpu_kind === 'shared') {
    const includedRamGb = cpus * 0.25;
    const extraRamGb = Math.max(0, memoryMb / 1024 - includedRamGb);
    return (
      cpus * REFERENCE_SHARED_CPU_MONTHLY_USD +
      extraRamGb * REFERENCE_EXTRA_RAM_GB_MONTHLY_USD
    );
  }
  if (guest.cpu_kind === 'performance') {
    const includedRamGb = cpus * 2;
    const extraRamGb = Math.max(0, memoryMb / 1024 - includedRamGb);
    return (
      cpus * REFERENCE_PERFORMANCE_CPU_MONTHLY_USD +
      extraRamGb * REFERENCE_EXTRA_RAM_GB_MONTHLY_USD
    );
  }
  return null;
}

function parseArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('flyctl returned invalid JSON');
  }
  return parsed as T[];
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
