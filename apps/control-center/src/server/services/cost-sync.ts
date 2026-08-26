import type { CostSnapshot, FetchLike } from '@zapengine/cost-observability';

import type { ControlCenterConfig } from '../config/env.js';
import {
  createCostRepository,
  type CostRepository,
} from './cost-repository.js';
import { collectCostProviders } from './costs.js';

export interface CostSyncSummaryItem {
  provider: string;
  label: string;
  status: 'persisted' | 'skipped' | 'error';
  expected: boolean;
  accruedCostUsd: number | null;
  message: string | null;
}

export interface CostSyncSummary {
  syncedAt: string;
  persisted: number;
  providers: CostSyncSummaryItem[];
}

export async function syncCosts(input: {
  config: ControlCenterConfig;
  repository?: CostRepository | null;
  fetch?: FetchLike;
  now?: Date;
}): Promise<CostSyncSummary> {
  const now = input.now ?? new Date();
  const repository = input.repository ?? createCostRepository(input.config);
  if (!repository) {
    throw new Error('Supabase ops repository is not configured');
  }

  const pricingRates = await repository.loadPricingRates();
  const [collected, latestProviders] = await Promise.all([
    collectCostProviders({
      config: input.config,
      pricingRates,
      fetch: input.fetch,
      now,
    }),
    repository.loadLatestProviders(),
  ]);
  const flyCarryForward = carryForwardFlyEstimate(latestProviders, now);

  const providers: CostSyncSummaryItem[] = [];
  let persisted = 0;
  for (const result of collected) {
    const snapshot =
      result.provider === 'fly' && !result.snapshot
        ? flyCarryForward
        : result.snapshot;
    if (!snapshot) {
      providers.push({
        provider: result.provider,
        label: result.label,
        status: result.status === 'error' ? 'error' : 'skipped',
        expected: result.expected,
        accruedCostUsd: null,
        message: result.message,
      });
      continue;
    }
    try {
      await repository.upsertSnapshot(snapshot, result.pricingRateId);
      persisted += 1;
      providers.push({
        provider: result.provider,
        label: result.label,
        status: 'persisted',
        expected: result.expected,
        accruedCostUsd: snapshot.accruedCostUsd,
        message:
          result.provider === 'fly' && flyCarryForward
            ? 'Carried forward current-month manual estimate'
            : result.message,
      });
    } catch {
      providers.push({
        provider: result.provider,
        label: result.label,
        status: 'error',
        expected: result.expected,
        accruedCostUsd: snapshot.accruedCostUsd,
        message: 'Snapshot persistence failed',
      });
    }
  }

  return { syncedAt: now.toISOString(), persisted, providers };
}

// `persisted` alone cannot express success: Supabase is a fixed-rate provider
// with no credential of its own, so it lands a snapshot even when every vendor
// key is gone. Only the expected-but-absent set separates a revoked key from
// Fly.io deliberately sitting in manual mode.
export function degradedProviders(
  summary: CostSyncSummary,
): CostSyncSummaryItem[] {
  return summary.providers.filter(
    (provider) => provider.expected && provider.status !== 'persisted',
  );
}

function carryForwardFlyEstimate(
  providers: Awaited<ReturnType<CostRepository['loadLatestProviders']>>,
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
  return {
    ...snapshot,
    periodEnd: now.toISOString(),
    fetchedAt: now.toISOString(),
  };
}
