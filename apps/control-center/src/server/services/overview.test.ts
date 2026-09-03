import { describe, expect, it, vi } from 'vitest';

import {
  FLY_RUN_RATE_USAGE_KEY,
  type CostProviderResult,
} from '../../shared/types.js';
import { readControlCenterConfig } from '../config/env.js';
import {
  costRepositoryFake,
  flyBilledRow,
  flyRunRateOnlyRow,
  ledgerRow,
  openRouterRow,
  supabaseFixedRow,
} from './__fixtures__/cost.js';
import {
  FLY_RUN_RATE_ONLY_MESSAGE,
  toProviderResults,
  type SnapshotRow,
} from './cost-history-aggregate.js';
import type { CostRepository } from './cost-repository.js';
import { createOverviewService } from './overview.js';

const FETCHED_AT = '2026-09-01T09:31:28.411Z';

const social = {
  status: 'ok' as const,
  message: null,
  window: 'latest' as const,
  generatedAt: FETCHED_AT,
  accounts: [],
  decisions: [],
  episodes: [],
};

const OPENROUTER = openRouterRow();
const SUPABASE_FIXED = supabaseFixedRow();
const FLY_RUN_RATE_ONLY = flyRunRateOnlyRow();
const FLY_BILLED = flyBilledRow();

const NOW = new Date('2026-09-02T06:55:34.382Z');

/** Dates a ledger row into the month `NOW` falls in. */
const THIS_MONTH: Partial<SnapshotRow> = {
  snapshot_date: '2026-09-01',
  period_start: '2026-09-01T00:00:00.000Z',
  period_end: '2026-09-01T09:31:28.411Z',
  fetched_at: '2026-09-01T09:31:28.411Z',
};

/** What an operator recorded off the Fly dashboard, dated by the caller. */
const FLY_RECORDED: Partial<SnapshotRow> = {
  provider: 'fly',
  accrued_cost_usd: 14.02,
  projected_cost_usd: 14.02,
  cost_type: 'estimated',
  source: 'manual',
};

function overviewWith(
  loadLatestProviders: CostRepository['loadLatestProviders'],
) {
  return createOverviewService({
    config: readControlCenterConfig({}),
    repository: costRepositoryFake({ loadLatestProviders }),
    loadSocial: vi.fn().mockResolvedValue(social),
    now: () => NOW,
  }).getOverview();
}

function overviewFor(providers: CostProviderResult[]) {
  return overviewWith(vi.fn().mockResolvedValue(providers));
}

/**
 * The same overview over persisted rows instead of finished provider cards,
 * so the ledger read's own month rule is part of what the totals are measured
 * against rather than something a hand-written card has already decided.
 */
function overviewOverLedger(rows: SnapshotRow[]) {
  return overviewWith(
    vi.fn((now: Date) => Promise.resolve(toProviderResults(rows, now))),
  );
}

describe('createOverviewService', () => {
  it('reads persisted costs fresh even when an external process changes the ledger', async () => {
    const loadLatestProviders = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([SUPABASE_FIXED]);
    const loadSocial = vi.fn().mockResolvedValue(social);
    const service = createOverviewService({
      config: readControlCenterConfig({
        CONTROL_CENTER_CACHE_TTL_MS: '900000',
      }),
      repository: costRepositoryFake({ loadLatestProviders }),
      loadSocial,
      now: () => new Date(FETCHED_AT),
    });

    expect((await service.getOverview()).accruedCostUsd).toBeNull();
    expect((await service.getOverview()).accruedCostUsd).toBe(25);
    expect(loadLatestProviders).toHaveBeenCalledTimes(2);
    expect(loadSocial).toHaveBeenCalledTimes(1);
  });

  it('counts fixed monthly commitments once instead of prorating or projecting them again', async () => {
    const result = await overviewFor([
      OPENROUTER,
      SUPABASE_FIXED,
      FLY_RUN_RATE_ONLY,
    ]);
    const supabase = result.providers.find(
      (provider) => provider.provider === 'supabase',
    );

    expect(result.accruedCostUsd).toBeCloseTo(25.12789037, 8);
    expect(result.projectedCostUsd).toBe(34.67);
    expect(supabase?.snapshot).toMatchObject({
      accruedCostUsd: 25,
      projectedCostUsd: 25,
      costType: 'fixed',
    });
  });

  it('never lets the Fly compute run-rate reach projectedCostUsd', async () => {
    const result = await overviewFor([
      OPENROUTER,
      SUPABASE_FIXED,
      FLY_RUN_RATE_ONLY,
    ]);
    const fly = result.providers.find(
      (provider) => provider.provider === 'fly',
    );
    const runRate = fly?.snapshot?.usage.find(
      (item) => item.key === FLY_RUN_RATE_USAGE_KEY,
    );

    // The run-rate is visible as usage and nowhere else: summing it would put
    // the headline at $102.37 for a month Fly will bill around $14.
    expect(runRate?.value).toBe(67.7);
    expect(fly?.snapshot?.projectedCostUsd).toBeNull();
    expect(fly?.snapshot?.accruedCostUsd).toBeNull();
    expect(fly?.message).toBe(FLY_RUN_RATE_ONLY_MESSAGE);
    expect(result.projectedCostUsd).toBe(34.67);
  });

  it('counts Fly in both totals once an operator records the billed figure', async () => {
    const result = await overviewFor([OPENROUTER, SUPABASE_FIXED, FLY_BILLED]);

    expect(result.accruedCostUsd).toBeCloseTo(39.14789037, 8);
    expect(result.projectedCostUsd).toBeCloseTo(48.69, 8);
  });

  it('leaves a Fly figure recorded before the rollover out of this month', async () => {
    const result = await overviewOverLedger([
      ledgerRow(THIS_MONTH),
      ledgerRow(FLY_RECORDED),
    ]);
    const fly = result.providers.find(
      (provider) => provider.provider === 'fly',
    );

    // August's $14.02 is August's bill. Summing it into a September headline
    // is the invented spend the run-rate once produced, from a staler source.
    expect(result.accruedCostUsd).toBe(0.12);
    expect(result.projectedCostUsd).toBe(9.67);
    expect(fly).toMatchObject({ status: 'unconfigured', snapshot: null });
    expect(fly?.message).toContain('2026-08-28');
  });

  it('counts a Fly figure the operator recorded this month', async () => {
    const result = await overviewOverLedger([
      ledgerRow(THIS_MONTH),
      ledgerRow({ ...FLY_RECORDED, ...THIS_MONTH }),
    ]);

    expect(result.accruedCostUsd).toBeCloseTo(14.14, 8);
    expect(result.projectedCostUsd).toBeCloseTo(23.69, 8);
  });
});
