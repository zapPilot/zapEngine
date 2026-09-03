import type { CostSnapshot, FetchLike } from '@zapengine/cost-observability';

import {
  FLY_COLLECTOR_USAGE_KEYS,
  type CostProviderResult,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import {
  createCostRepository,
  type CostRepository,
} from './cost-repository.js';
import { collectCostProviders, type CollectedCostProvider } from './costs.js';
import type { FlyctlRunner } from './fly.js';

export interface CostSyncSummaryItem {
  provider: string;
  label: string;
  status: 'persisted' | 'skipped' | 'error';
  accruedCostUsd: number | null;
  message: string | null;
}

export interface CostSyncSummary {
  syncedAt: string;
  persisted: number;
  providers: CostSyncSummaryItem[];
}

interface ResolvedSnapshot {
  snapshot: CostSnapshot | null;
  /**
   * What to report for this provider, independent of whether a row was
   * written: Fly can persist a carried-forward row while still reporting the
   * collector failure that produced it.
   */
  status: CostSyncSummaryItem['status'];
  message: string | null;
}

const FLY_COLLECTOR_USAGE_KEY_SET = new Set<string>(FLY_COLLECTOR_USAGE_KEYS);

export async function syncCosts(input: {
  config: ControlCenterConfig;
  repository?: CostRepository | null;
  fetch?: FetchLike;
  now?: Date;
  flyRun?: FlyctlRunner;
}): Promise<CostSyncSummary> {
  const now = input.now ?? new Date();
  const repository = input.repository ?? createCostRepository(input.config);
  if (!repository) {
    throw new Error('Supabase ops repository is not configured');
  }

  const pricingRates = await repository.loadPricingRates();
  // The providers need last month's totals to project this month, so the two
  // reads run together and the collectors follow. A history read is an
  // optimisation, not a precondition: losing it costs projection accuracy,
  // and stalling the whole ledger over that would be the worse trade.
  //
  // The provider read is month-gated, the same view the dashboard gets: a Fly
  // figure recorded before a month rollover comes back with no snapshot, so
  // `resolveFlySnapshot` cannot resurrect last month's bill into today's row.
  const [history, latestProviders] = await Promise.all([
    repository.loadHistory(now).catch(() => null),
    repository.loadLatestProviders(now),
  ]);
  const collected = await collectCostProviders({
    config: input.config,
    pricingRates,
    fetch: input.fetch,
    now,
    priorMonthTotals: history?.previousMonthByProvider ?? null,
    flyRun: input.flyRun,
  });

  const providers: CostSyncSummaryItem[] = [];
  let persisted = 0;
  for (const result of collected) {
    const resolved = resolveSnapshot(result, latestProviders, now);
    if (!resolved.snapshot) {
      providers.push({
        provider: result.provider,
        label: result.label,
        status: resolved.status,
        accruedCostUsd: null,
        message: resolved.message,
      });
      continue;
    }
    try {
      await repository.upsertSnapshot(resolved.snapshot, result.pricingRateId);
      persisted += 1;
      providers.push({
        provider: result.provider,
        label: result.label,
        status: resolved.status,
        accruedCostUsd: resolved.snapshot.accruedCostUsd,
        message: resolved.message,
      });
    } catch {
      providers.push({
        provider: result.provider,
        label: result.label,
        status: 'error',
        accruedCostUsd: resolved.snapshot.accruedCostUsd,
        message: 'Snapshot persistence failed',
      });
    }
  }

  return { syncedAt: now.toISOString(), persisted, providers };
}

function resolveSnapshot(
  result: CollectedCostProvider,
  latestProviders: CostProviderResult[],
  now: Date,
): ResolvedSnapshot {
  if (result.provider === 'fly') {
    return resolveFlySnapshot(result, latestProviders, now);
  }
  return {
    snapshot: result.snapshot,
    status: result.snapshot
      ? 'persisted'
      : result.status === 'error'
        ? 'error'
        : 'skipped',
    message: result.message,
  };
}

/**
 * Fly is the one provider whose cost and whose evidence come from different
 * places: the run-rate from `flyctl`, the money from an operator reading the
 * Fly dashboard (Fly has no billing API). Every daily row therefore has to be
 * assembled from up to two sources, and the five outcomes mean different
 * things:
 *
 * - collector + this month's manual figure: the billed estimate is still the
 *   truth, so the money and `periodEnd` survive — `periodEnd` records *when*
 *   the operator read the dashboard and is not today. `usage` refreshes so the
 *   fleet census stays current, and `fetchedAt` is restamped to now because
 *   `upsertSnapshot` derives `snapshot_date` from it: keeping the operator's
 *   `fetchedAt` would overwrite the day they read the dashboard instead of
 *   writing today's row.
 * - collector alone: a capacity reading with no money attached. Persisted with
 *   both cost fields null, and the message names the remedy, because a null
 *   here silently drops Fly out of the headline KPIs.
 * - manual alone, no collector configured (`FLY_COST_MODE=manual`): carry the
 *   figure forward, but strip the collector's usage keys rather than re-stamp
 *   yesterday's Machine counts with today's `fetchedAt` and pass stale fleet
 *   state off as a current reading.
 * - manual alone because the collector failed: the same carried row, reported
 *   as an error.
 * - neither: nothing to write.
 *
 * A collector failure keeps `status: 'error'` even though the carried row
 * persists. `src/server/sync.ts` exits non-zero on any provider error, and
 * laundering the failure into a green "carried forward" line is how a broken
 * flyctl could sit in the scheduled job indefinitely without turning it red.
 *
 * "Manual" always means the current UTC month. A previous month's figure is
 * last month's bill; carrying it over a rollover would invent spend.
 */
function resolveFlySnapshot(
  result: CollectedCostProvider,
  latestProviders: CostProviderResult[],
  now: Date,
): ResolvedSnapshot {
  const manual = currentMonthManualSnapshot(latestProviders, now);
  const collected = result.snapshot;

  if (collected && manual) {
    return {
      snapshot: {
        ...manual,
        usage: collected.usage,
        fetchedAt: now.toISOString(),
      },
      status: 'persisted',
      message: 'Carried the billed estimate; refreshed the compute run-rate',
    };
  }
  if (collected) {
    return {
      snapshot: collected,
      status: 'persisted',
      message:
        'Compute run-rate only — no billed figure this month; ' +
        'record one with ops:cost snapshot fly <usd>',
    };
  }
  if (manual) {
    const carried: CostSnapshot = {
      ...manual,
      usage: manual.usage.filter(
        (item) => !FLY_COLLECTOR_USAGE_KEY_SET.has(item.key),
      ),
      fetchedAt: now.toISOString(),
    };
    return result.status === 'error'
      ? {
          snapshot: carried,
          status: 'error',
          message:
            'Fly run-rate collector failed; carried forward manual estimate',
        }
      : {
          snapshot: carried,
          status: 'persisted',
          message: 'Carried forward current-month manual estimate',
        };
  }
  return {
    snapshot: null,
    status: result.status === 'error' ? 'error' : 'skipped',
    message: result.message,
  };
}

/**
 * The recorded Fly figure the carry-forward may reuse.
 *
 * `loadLatestProviders` already withholds a previous month's row, so in
 * production this repeats a check that has passed. It stays because the month
 * rule belongs to the carry-forward rather than to any one repository:
 * whatever a ledger hands over, a figure read off last month's dashboard is
 * last month's bill.
 */
function currentMonthManualSnapshot(
  providers: CostProviderResult[],
  now: Date,
): CostSnapshot | null {
  const snapshot = providers.find(
    (provider) => provider.provider === 'fly',
  )?.snapshot;
  if (
    !snapshot ||
    snapshot.source !== 'manual' ||
    snapshot.fetchedAt.slice(0, 7) !== now.toISOString().slice(0, 7)
  ) {
    return null;
  }
  return snapshot;
}
