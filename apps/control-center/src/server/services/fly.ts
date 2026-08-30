import type { CostSnapshot } from '@zapengine/cost-observability';

import { runFlyctl } from './flyctl.js';

const REFERENCE_SHARED_CPU_MONTHLY_USD = 2.02;
const REFERENCE_PERFORMANCE_CPU_MONTHLY_USD = 32.19;
const REFERENCE_EXTRA_RAM_GB_MONTHLY_USD = 5.2;

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

export async function fetchFlyRunRateSnapshot(input: {
  now: Date;
  run?: (args: string[]) => Promise<string>;
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
    projectedCostUsd: roundUsd(monthlyRunRateUsd),
    costType: 'estimated',
    source: 'api',
    usage: [
      {
        key: 'monthly',
        unit: 'usd',
        label: 'Current compute monthly run-rate',
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
