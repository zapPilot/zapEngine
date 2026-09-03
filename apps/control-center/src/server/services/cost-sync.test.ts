import type {
  CostProvider,
  CostSnapshot,
  CostUsageItem,
  FetchLike,
} from '@zapengine/cost-observability';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { FLY_RUN_RATE_USAGE_KEY } from '../../shared/types.js';
import {
  readControlCenterConfig,
  type ControlCenterConfig,
} from '../config/env.js';
import {
  costRepositoryFake,
  EMPTY_COST_HISTORY,
  flyBilledRow,
  ledgerRow,
} from './__fixtures__/cost.js';
import { toProviderResults } from './cost-history-aggregate.js';
import type { CostRepository } from './cost-repository.js';
import {
  syncCosts,
  type CostSyncSummary,
  type CostSyncSummaryItem,
} from './cost-sync.js';
import type { FlyctlRunner } from './fly.js';

type UpsertSnapshotSpy = Mock<CostRepository['upsertSnapshot']>;

const NOW = new Date('2026-08-22T12:00:00.000Z');
const EARLY_SEPTEMBER = new Date('2026-09-01T12:00:00.000Z');

/**
 * What an operator read off the Fly dashboard on the 20th. The reading is
 * stamped with the day they took it, not the day a sync happens to run, so
 * these dates are what the carry-forward cases assert against.
 */
const AUGUST_DASHBOARD_READING: Partial<CostSnapshot> = {
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-08-20T12:00:00.000Z',
  fetchedAt: '2026-08-20T12:00:00.000Z',
  accruedCostUsd: 18.43,
  projectedCostUsd: 18.43,
};

/**
 * A manual row that still carries a collector census from an earlier run.
 * Re-publishing those items under today's `fetchedAt` would pass last night's
 * fleet off as a current reading, so a carried-forward row keeps only the item
 * the operator owns.
 */
const STALE_COLLECTOR_USAGE: CostUsageItem[] = [
  { key: FLY_RUN_RATE_USAGE_KEY, unit: 'usd', label: 'Run-rate', value: 67.7 },
  { key: 'running_machines', unit: 'units', label: 'Running', value: 3 },
  { key: 'operator_note', unit: 'units', label: 'Dashboard reads', value: 1 },
];

/** One started shared-cpu-1x/512MB Machine, i.e. a $3.32 monthly run-rate. */
const flyctlOneSharedMachine: FlyctlRunner = (args) => {
  if (args[0] === 'apps') {
    return Promise.resolve(JSON.stringify([{ Name: 'api' }]));
  }
  const guest = { cpu_kind: 'shared', cpus: 1, memory_mb: 512 };
  return Promise.resolve(
    JSON.stringify([{ state: 'started', config: { guest } }]),
  );
};

const flyctlFailure: FlyctlRunner = () =>
  Promise.reject(new Error('flyctl exited 1'));

function createUpsertSpy(): UpsertSnapshotSpy {
  return vi.fn<CostRepository['upsertSnapshot']>().mockResolvedValue(undefined);
}

function repositoryWithManualFly(
  upsertSnapshot: UpsertSnapshotSpy,
  snapshot: Partial<CostSnapshot> = {},
): CostRepository {
  return costRepositoryFake({
    upsertSnapshot,
    loadLatestProviders: vi
      .fn()
      .mockResolvedValue([
        flyBilledRow({ ...AUGUST_DASHBOARD_READING, ...snapshot }),
      ]),
  });
}

/**
 * The two carry-forward cases start from the same ledger — a recorded figure
 * whose `usage` still holds an earlier collector census — and differ only in
 * whether a collector answers at all this time.
 */
async function syncOverStaleCensus(input: {
  config: ControlCenterConfig;
  flyRun?: FlyctlRunner;
}): Promise<{ result: CostSyncSummary; upsertSnapshot: UpsertSnapshotSpy }> {
  const upsertSnapshot = createUpsertSpy();
  const result = await syncCosts({
    config: input.config,
    flyRun: input.flyRun,
    repository: repositoryWithManualFly(upsertSnapshot, {
      usage: STALE_COLLECTOR_USAGE,
    }),
    now: NOW,
  });
  return { result, upsertSnapshot };
}

function openRouterFetch(monthToDateUsd: number): FetchLike {
  return vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            usage: monthToDateUsd,
            usage_daily: monthToDateUsd,
            usage_weekly: monthToDateUsd,
            usage_monthly: monthToDateUsd,
            limit: null,
            limit_remaining: null,
          },
        }),
      ),
    ),
  );
}

function persistedSnapshot(
  spy: UpsertSnapshotSpy,
  provider: CostProvider,
): CostSnapshot | undefined {
  const call = spy.mock.calls.find(
    ([snapshot]) => snapshot.provider === provider,
  );
  return call?.[0];
}

function flySummary(summary: CostSyncSummary): CostSyncSummaryItem | undefined {
  return summary.providers.find((provider) => provider.provider === 'fly');
}

function flyctlConfig() {
  return readControlCenterConfig({ FLY_COST_MODE: 'flyctl' });
}

function openRouterConfig() {
  return readControlCenterConfig({ OPENROUTER_API_KEY: 'openrouter-key' });
}

describe('syncCosts', () => {
  it('persists healthy providers when another provider fetch fails', async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = costRepositoryFake({
      upsertSnapshot,
      loadPricingRates: vi.fn().mockResolvedValue([
        {
          id: 'debank-rate',
          provider: 'debank',
          metricKey: 'api_unit',
          unit: 'unit',
          priceUsd: 0.0002,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          effectiveTo: null,
        },
        {
          id: 'supabase-rate',
          provider: 'supabase',
          metricKey: 'pro_plan',
          unit: 'month',
          priceUsd: 25,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          effectiveTo: null,
        },
      ]),
    });
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('openrouter')) {
        return new Response('nope', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          balance: 500_000,
          stats: [{ usage: 14_405, remains: 500_000, date: '2026-08-22' }],
        }),
      );
    });

    const result = await syncCosts({
      config: readControlCenterConfig({
        OPENROUTER_API_KEY: 'openrouter-key',
        DEBANK_API_KEY: 'debank-key',
      }),
      repository,
      fetch: fetcher,
      now: NOW,
    });

    expect(result.persisted).toBe(2);
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'openrouter', status: 'error' }),
        expect.objectContaining({
          provider: 'debank',
          status: 'persisted',
          accruedCostUsd: 2.881,
        }),
        expect.objectContaining({
          provider: 'supabase',
          status: 'persisted',
          accruedCostUsd: 25,
        }),
      ]),
    );
    expect(upsertSnapshot).toHaveBeenCalledTimes(2);
    expect(upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'supabase',
        accruedCostUsd: 25,
        projectedCostUsd: 25,
        costType: 'fixed',
      }),
      'supabase-rate',
    );
  });

  it('keeps the billed Fly figure and refreshes only the run-rate', async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = repositoryWithManualFly(upsertSnapshot);

    const result = await syncCosts({
      config: flyctlConfig(),
      repository,
      flyRun: flyctlOneSharedMachine,
      now: NOW,
    });

    expect(persistedSnapshot(upsertSnapshot, 'fly')).toMatchObject({
      accruedCostUsd: 18.43,
      projectedCostUsd: 18.43,
      source: 'manual',
      // The operator read the dashboard on the 20th and that is what
      // `periodEnd` records; a nightly sync must not move the reading forward.
      periodEnd: '2026-08-20T12:00:00.000Z',
      fetchedAt: '2026-08-22T12:00:00.000Z',
      usage: [
        expect.objectContaining({ key: FLY_RUN_RATE_USAGE_KEY, value: 3.32 }),
        expect.objectContaining({ key: 'running_machines', value: 1 }),
        expect.objectContaining({ key: 'stopped_machines', value: 0 }),
        expect.objectContaining({ key: 'apps', value: 1 }),
      ],
    });
    expect(flySummary(result)).toMatchObject({
      status: 'persisted',
      accruedCostUsd: 18.43,
      message: expect.stringContaining('run-rate'),
    });
  });

  it('never persists the Fly run-rate as a cost when no bill was recorded', async () => {
    const upsertSnapshot = createUpsertSpy();

    const result = await syncCosts({
      config: flyctlConfig(),
      repository: costRepositoryFake({ upsertSnapshot }),
      flyRun: flyctlOneSharedMachine,
      now: NOW,
    });

    expect(persistedSnapshot(upsertSnapshot, 'fly')).toMatchObject({
      accruedCostUsd: null,
      projectedCostUsd: null,
      source: 'api',
    });
    expect(flySummary(result)).toMatchObject({
      status: 'persisted',
      accruedCostUsd: null,
      message: expect.stringContaining('ops:cost snapshot fly'),
    });
  });

  it('drops a manual Fly figure that belongs to the previous month', async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = repositoryWithManualFly(upsertSnapshot, {
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-19T12:00:00.000Z',
      fetchedAt: '2026-07-19T12:00:00.000Z',
    });

    await syncCosts({
      config: flyctlConfig(),
      repository,
      flyRun: flyctlOneSharedMachine,
      now: NOW,
    });

    const fly = persistedSnapshot(upsertSnapshot, 'fly');
    expect(fly?.source).toBe('api');
    expect(fly?.accruedCostUsd).toBeNull();
    expect(fly?.projectedCostUsd).toBeNull();
    expect(fly?.periodEnd).toBe(NOW.toISOString());
  });

  it('reports an error when the run-rate collector fails', async () => {
    const { result, upsertSnapshot } = await syncOverStaleCensus({
      config: flyctlConfig(),
      flyRun: flyctlFailure,
    });

    const fly = persistedSnapshot(upsertSnapshot, 'fly');
    expect(fly?.accruedCostUsd).toBe(18.43);
    expect(fly?.usage.map((item) => item.key)).toEqual(['operator_note']);
    // `src/server/sync.ts` exits non-zero on any provider error, so a broken
    // flyctl has to stay visible even though the ledger kept advancing.
    expect(flySummary(result)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('collector failed'),
    });
  });

  it('carries a current-month manual Fly estimate into the daily snapshot', async () => {
    const { result, upsertSnapshot } = await syncOverStaleCensus({
      config: readControlCenterConfig({}),
    });

    expect(flySummary(result)).toMatchObject({
      status: 'persisted',
      accruedCostUsd: 18.43,
    });
    expect(persistedSnapshot(upsertSnapshot, 'fly')).toMatchObject({
      periodEnd: '2026-08-20T12:00:00.000Z',
      fetchedAt: '2026-08-22T12:00:00.000Z',
      usage: [expect.objectContaining({ key: 'operator_note' })],
    });
  });

  it("finds this month's recorded figure through the month-gated ledger read", async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = costRepositoryFake({
      upsertSnapshot,
      loadLatestProviders: vi.fn((at: Date) =>
        Promise.resolve(
          toProviderResults(
            [
              ledgerRow({
                provider: 'fly',
                snapshot_date: '2026-08-20',
                period_end: '2026-08-20T12:00:00.000Z',
                fetched_at: '2026-08-20T12:00:00.000Z',
                accrued_cost_usd: 18.43,
                projected_cost_usd: 18.43,
                cost_type: 'estimated',
                source: 'manual',
              }),
            ],
            at,
          ),
        ),
      ),
    });

    await syncCosts({
      config: flyctlConfig(),
      repository,
      flyRun: flyctlOneSharedMachine,
      now: NOW,
    });

    // The gate that keeps last month's bill out of this month's headline must
    // not also hide the figure this month's carry-forward is built on.
    expect(persistedSnapshot(upsertSnapshot, 'fly')).toMatchObject({
      accruedCostUsd: 18.43,
      source: 'manual',
      periodEnd: '2026-08-20T12:00:00.000Z',
    });
  });

  it('projects OpenRouter from last month instead of a first-day slope', async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = costRepositoryFake({
      upsertSnapshot,
      loadHistory: vi.fn().mockResolvedValue({
        ...EMPTY_COST_HISTORY,
        previousMonthByProvider: [
          { provider: 'openrouter', accruedCostUsd: 12 },
        ],
      }),
    });

    await syncCosts({
      config: openRouterConfig(),
      repository,
      fetch: openRouterFetch(0.6),
      now: EARLY_SEPTEMBER,
    });

    // Half a day into September with $0.60 spent, the bare slope reads
    // 0.60 + (0.60 / 0.5) x 29.5 = $36. Half a day into the seven-day blend
    // the daily rate is still 13/14 August's ($12 / 31 days), so the
    // projection lands on 0.60 + 0.4452 x 29.5 = $13.73.
    const openRouter = persistedSnapshot(upsertSnapshot, 'openrouter');
    expect(openRouter?.accruedCostUsd).toBe(0.6);
    expect(openRouter?.projectedCostUsd).toBe(13.73);
  });

  it('still persists when the history read fails', async () => {
    const upsertSnapshot = createUpsertSpy();
    const repository = costRepositoryFake({
      upsertSnapshot,
      loadHistory: vi.fn().mockRejectedValue(new Error('history unavailable')),
    });

    const result = await syncCosts({
      config: openRouterConfig(),
      repository,
      fetch: openRouterFetch(0.6),
      now: EARLY_SEPTEMBER,
    });

    expect(result.persisted).toBe(1);
    // No prior month reached the loader, so the projection is the legacy slope.
    expect(persistedSnapshot(upsertSnapshot, 'openrouter')).toMatchObject({
      accruedCostUsd: 0.6,
      projectedCostUsd: 36,
    });
  });
});
