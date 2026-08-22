import type {
  CostHistoryResponse,
  CostProviderResult,
  OverviewResponse,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createAsyncCache } from './cache.js';
import { loadCostHistory } from './cost-history.js';
import {
  createCostRepository,
  type CostRepository,
} from './cost-repository.js';
import { syncCosts } from './cost-sync.js';
import { loadSocialPerformance } from './social.js';

const EMPTY_HISTORY: CostHistoryResponse = {
  currentMonthDaily: [],
  monthlyTotals: [],
  cashSpendUsd: null,
};

export function createOverviewService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  repository?: CostRepository | null;
  loadSocial?: typeof loadSocialPerformance;
  sync?: typeof syncCosts;
}) {
  const now = input.now ?? (() => new Date());
  const repository = input.repository ?? createCostRepository(input.config);
  const loadSocial = input.loadSocial ?? loadSocialPerformance;
  const runSync = input.sync ?? syncCosts;
  const cache = createAsyncCache({
    ttlMs: input.config.CONTROL_CENTER_CACHE_TTL_MS,
    load: async (): Promise<OverviewResponse> => {
      const fetchedAt = now();
      const [providers, history, social] = await Promise.all([
        repository
          ? repository.loadLatestProviders()
          : Promise.resolve(unconfiguredProviders()),
        repository
          ? loadCostHistory({ repository, now: fetchedAt })
          : Promise.resolve(EMPTY_HISTORY),
        loadSocial({ config: input.config, now: fetchedAt }),
      ]);
      const snapshots = providers.flatMap((provider) =>
        provider.snapshot ? [provider.snapshot] : [],
      );
      const accrued = snapshots
        .map((snapshot) => snapshot.accruedCostUsd)
        .filter((value): value is number => value !== null);
      const projected = snapshots
        .map((snapshot) => snapshot.projectedCostUsd)
        .filter((value): value is number => value !== null);
      const followers = social.accounts
        .map((account) => account.followers)
        .filter((value): value is number => value !== null);

      return {
        generatedAt: fetchedAt.toISOString(),
        accruedCostUsd: sumKnown(accrued),
        projectedCostUsd: sumKnown(projected),
        cashInvoiceSpendUsd: history.cashSpendUsd,
        aumUsd: null,
        activeAccounts: null,
        socialReach: sumKnown(followers),
        providers,
        social,
      };
    },
  });

  return {
    getOverview: (force = false) => cache.get(force),
    getCostHistory: () =>
      repository
        ? loadCostHistory({ repository, now: now() })
        : Promise.resolve(EMPTY_HISTORY),
    syncCosts: async () => {
      if (!repository) {
        throw new Error('Supabase ops repository is not configured');
      }
      const summary = await runSync({
        config: input.config,
        repository,
        now: now(),
      });
      await cache.get(true);
      return summary;
    },
    getSocial: (
      window: Parameters<typeof loadSocialPerformance>[0]['window'],
    ) => loadSocial({ config: input.config, now: now(), window }),
  };
}

function unconfiguredProviders(): CostProviderResult[] {
  return [
    placeholder('openrouter', 'OpenRouter', 'actual'),
    placeholder('debank', 'DeBank', 'list-price-equivalent'),
    placeholder('supabase', 'Supabase', 'fixed'),
    placeholder('fly', 'Fly.io', 'estimated'),
  ];
}

function placeholder(
  provider: CostProviderResult['provider'],
  label: string,
  costType: CostProviderResult['costType'],
): CostProviderResult {
  return {
    provider,
    label,
    status: 'unconfigured',
    costType,
    snapshot: null,
    message: 'Supabase ops ledger is not connected',
  };
}

function sumKnown(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}
