import type { OverviewResponse } from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createAsyncCache } from './cache.js';
import { loadCostProviders } from './costs.js';
import { loadSocialPerformance } from './social.js';

export function createOverviewService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  loadCosts?: typeof loadCostProviders;
  loadSocial?: typeof loadSocialPerformance;
}) {
  const now = input.now ?? (() => new Date());
  const loadCosts = input.loadCosts ?? loadCostProviders;
  const loadSocial = input.loadSocial ?? loadSocialPerformance;
  const cache = createAsyncCache({
    ttlMs: input.config.CONTROL_CENTER_CACHE_TTL_MS,
    load: async (): Promise<OverviewResponse> => {
      const fetchedAt = now();
      const [providers, social] = await Promise.all([
        loadCosts({ config: input.config, now: fetchedAt }),
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
        accruedCostUsd: accrued.length
          ? accrued.reduce((sum, value) => sum + value, 0)
          : null,
        projectedCostUsd: projected.length
          ? projected.reduce((sum, value) => sum + value, 0)
          : null,
        cashInvoiceSpendUsd: null,
        aumUsd: null,
        activeAccounts: null,
        socialReach: followers.length
          ? followers.reduce((sum, value) => sum + value, 0)
          : null,
        providers,
        social,
      };
    },
  });

  return {
    getOverview: (force = false) => cache.get(force),
    getSocial: (
      window: Parameters<typeof loadSocialPerformance>[0]['window'],
    ) => loadSocial({ config: input.config, now: now(), window }),
  };
}
