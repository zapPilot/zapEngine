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
import { sumKnown } from './numbers.js';
import { loadProductHealth } from './product-health.js';
import { loadSocialPerformance } from './social.js';

const EMPTY_HISTORY: CostHistoryResponse = {
  currentMonthDaily: [],
  monthlyTotals: [],
  cashSpendUsd: null,
  previousMonthByProvider: [],
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
  const socialCache = createAsyncCache({
    ttlMs: input.config.CONTROL_CENTER_CACHE_TTL_MS,
    load: () => loadSocial({ config: input.config, now: now() }),
  });

  async function getOverview(forceSocial = false): Promise<OverviewResponse> {
    const fetchedAt = now();
    const [providers, history, product, social] = await Promise.all([
      repository
        ? repository
            .loadLatestProviders(fetchedAt)
            .catch((error) => repositoryErrorProviders(error))
        : Promise.resolve(unconfiguredProviders()),
      repository
        ? loadCostHistory({ repository, now: fetchedAt }).catch(
            () => EMPTY_HISTORY,
          )
        : Promise.resolve(EMPTY_HISTORY),
      loadProductHealth({ config: input.config, now: fetchedAt }),
      socialCache.get(forceSocial),
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
      aumUsd: product.observedPortfolioUsd,
      activeAccounts: product.wau,
      socialReach: sumKnown(followers),
      product,
      providers,
      social,
    };
  }

  return {
    getOverview,
    getCostHistory: () =>
      repository
        ? loadCostHistory({ repository, now: now() }).catch(() => EMPTY_HISTORY)
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
      await socialCache.get(true);
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

function repositoryErrorProviders(error: unknown): CostProviderResult[] {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : 'Cost ledger unavailable';
  return unconfiguredProviders().map((provider) => ({
    ...provider,
    status: 'error' as const,
    message,
  }));
}
