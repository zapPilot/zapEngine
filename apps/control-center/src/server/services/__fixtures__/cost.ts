/**
 * Persisted ledger rows as the server-side cost tests need them, each named
 * after the accounting situation it stands for rather than the assertion that
 * first wanted it.
 *
 * Fly deliberately gets two separate rows. `costType` cannot tell them apart —
 * both are `estimated` — and only `source` says whether the money was read off
 * Fly's dashboard by an operator (`manual`) or is the collector's whole-month
 * list price with no billed figure behind it at all (`api`). Blurring exactly
 * that distinction is what once published a $67.70 month-end for a month Fly
 * billed around $14, so no test may reach one row by tweaking the other.
 */
import type { CostProvider, CostSnapshot } from '@zapengine/cost-observability';
import { vi } from 'vitest';

import {
  FLY_RUN_RATE_USAGE_KEY,
  type CostHistoryResponse,
  type CostProviderResult,
} from '../../../shared/types.js';
import {
  FLY_RUN_RATE_ONLY_MESSAGE,
  type SnapshotRow,
} from '../cost-history-aggregate.js';
import type { CostRepository } from '../cost-repository.js';

const PERIOD_START = '2026-08-01T00:00:00.000Z';
const OBSERVED_AT = '2026-08-28T12:00:00.000Z';

export const EMPTY_COST_HISTORY: CostHistoryResponse = {
  currentMonthDaily: [],
  monthlyTotals: [],
  cashSpendUsd: null,
  previousMonthByProvider: [],
};

/**
 * One persisted row exactly as PostgREST hands it back: priced OpenRouter
 * spend, read on the day these fixtures share. A case that is about a date, a
 * provider or a basis overrides those fields and leaves the rest alone.
 *
 * Tests that need the read path's own rules — newest row per provider, and
 * which month a row still counts for — have to start from rows rather than
 * from finished `CostProviderResult`s, because those rules run on the way
 * between the two.
 */
export function ledgerRow(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    provider: 'openrouter',
    snapshot_date: OBSERVED_AT.slice(0, 10),
    period_start: PERIOD_START,
    period_end: OBSERVED_AT,
    accrued_cost_usd: 0.12,
    projected_cost_usd: 9.67,
    cost_type: 'actual',
    source: 'api',
    usage: [],
    pricing_rate_id: null,
    fetched_at: OBSERVED_AT,
    ...overrides,
  };
}

/**
 * The period is shared and the collector is healthy, because neither is ever
 * what these tests are about: what separates the rows below is the money and
 * the basis behind it. A case that does care about a date overrides it.
 */
function providerRow(input: {
  provider: CostProvider;
  label: string;
  message?: string;
  money: Pick<
    CostSnapshot,
    'accruedCostUsd' | 'projectedCostUsd' | 'costType' | 'source' | 'usage'
  >;
  overrides: Partial<CostSnapshot>;
}): CostProviderResult {
  const snapshot: CostSnapshot = {
    provider: input.provider,
    periodStart: PERIOD_START,
    periodEnd: OBSERVED_AT,
    fetchedAt: OBSERVED_AT,
    ...input.money,
    ...input.overrides,
  };
  return {
    provider: snapshot.provider,
    label: input.label,
    status: 'ok',
    costType: snapshot.costType,
    message: input.message ?? null,
    snapshot,
  };
}

/** Metered spend the provider has already charged, and its own projection. */
export function openRouterRow(
  overrides: Partial<CostSnapshot> = {},
): CostProviderResult {
  return providerRow({
    provider: 'openrouter',
    label: 'OpenRouter',
    money: {
      accruedCostUsd: 0.12789037,
      projectedCostUsd: 9.67,
      costType: 'actual',
      source: 'api',
      usage: [],
    },
    overrides,
  });
}

/**
 * A flat monthly plan: the whole commitment is owed the moment the month
 * starts, so accrued and projected are the same figure and neither prorates.
 */
export function supabaseFixedRow(
  overrides: Partial<CostSnapshot> = {},
): CostProviderResult {
  return providerRow({
    provider: 'supabase',
    label: 'Supabase',
    money: {
      accruedCostUsd: 25,
      projectedCostUsd: 25,
      costType: 'fixed',
      source: 'fixed',
      usage: [],
    },
    overrides,
  });
}

/**
 * All the flyctl collector can honestly leave behind: the list price of every
 * Machine that happened to be up, parked in `usage`, with no accrued or
 * projected figure at all. $67.70 is that ceiling — one on-demand render
 * worker caught mid-run — against a real Fly bill nearer $14.
 */
export function flyRunRateOnlyRow(
  overrides: Partial<CostSnapshot> = {},
): CostProviderResult {
  return providerRow({
    provider: 'fly',
    label: 'Fly.io',
    message: FLY_RUN_RATE_ONLY_MESSAGE,
    money: {
      accruedCostUsd: null,
      projectedCostUsd: null,
      costType: 'estimated',
      source: 'api',
      usage: [
        {
          key: FLY_RUN_RATE_USAGE_KEY,
          label: 'Compute run-rate (list price, whole month)',
          unit: 'usd',
          value: 67.7,
        },
      ],
    },
    overrides,
  });
}

/**
 * An operator read the Fly dashboard and recorded what it said, which is the
 * only way Fly gets a figure worth summing into the headline totals.
 */
export function flyBilledRow(
  overrides: Partial<CostSnapshot> = {},
): CostProviderResult {
  return providerRow({
    provider: 'fly',
    label: 'Fly.io',
    money: {
      accruedCostUsd: 14.02,
      projectedCostUsd: 14.02,
      costType: 'estimated',
      source: 'manual',
      usage: [],
    },
    overrides,
  });
}

/**
 * A ledger that reads as empty and accepts every write, so a test declares
 * only the call it is about. The defaults resolve rather than return
 * `undefined`: a caller that awaits an unstubbed read should see an empty
 * ledger, not a crash from somewhere unrelated to the case.
 */
export function costRepositoryFake(
  overrides: Partial<CostRepository> = {},
): CostRepository {
  return {
    loadPricingRates: vi.fn().mockResolvedValue([]),
    upsertSnapshot: vi.fn().mockResolvedValue(undefined),
    loadLatestProviders: vi.fn().mockResolvedValue([]),
    loadHistory: vi.fn().mockResolvedValue(EMPTY_COST_HISTORY),
    insertTransaction: vi.fn().mockResolvedValue(undefined),
    upsertManualSnapshot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
