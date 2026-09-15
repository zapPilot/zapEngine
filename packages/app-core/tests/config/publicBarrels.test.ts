import { describe, expect, it } from 'vitest';

const PUBLIC_BARRELS = [
  {
    path: 'src/adapters/index.ts',
    load: () => import('@core/adapters'),
    expectedExports: ['calculateAllocation'],
  },
  {
    path: 'src/hooks/analytics/index.ts',
    load: () => import('@core/hooks/analytics'),
    expectedExports: ['usePortfolioDashboard'],
  },
  {
    path: 'src/hooks/queries/analytics/index.ts',
    load: () => import('@core/hooks/queries/analytics'),
    expectedExports: ['useAnalyticsData'],
  },
  {
    path: 'src/hooks/queries/index.ts',
    load: () => import('@core/hooks/queries'),
    expectedExports: ['createQueryConfig', 'queryKeys'],
  },
  {
    path: 'src/hooks/queries/market/index.ts',
    load: () => import('@core/hooks/queries/market'),
    expectedExports: ['useMarketDashboardQuery'],
  },
  {
    path: 'src/hooks/queries/wallet/index.ts',
    load: () => import('@core/hooks/queries/wallet'),
    expectedExports: ['useUser', 'useUserWallets'],
  },
  {
    path: 'src/hooks/wallet/index.ts',
    load: () => import('@core/hooks/wallet'),
    expectedExports: ['useEtlJobPolling', 'useWalletMutations'],
  },
  {
    path: 'src/lib/analytics/index.ts',
    load: () => import('@core/lib/analytics'),
    expectedExports: ['classifyIncomeProtocol', 'transformToPerformanceChart'],
  },
  {
    path: 'src/lib/errors/index.ts',
    load: () => import('@core/lib/errors'),
    expectedExports: ['ServiceError', 'wrapServiceCall'],
  },
  {
    path: 'src/lib/http/index.ts',
    load: () => import('@core/lib/http'),
    expectedExports: ['APIError', 'httpGet', 'httpUtils'],
  },
  {
    path: 'src/services/index.ts',
    load: () => import('@core/services'),
    expectedExports: ['connectWallet', 'getPortfolioDashboard'],
  },
  {
    path: 'src/services/suggestion/index.ts',
    load: () => import('@core/services/suggestion'),
    expectedExports: ['deriveTriggerEvidence', 'buildTradeActions'],
  },
  {
    path: 'src/types/index.ts',
    load: () => import('@core/types'),
    expectedExports: ['allocationBreakdownSchema', 'PORTFOLIO_TAB_IDS'],
  },
  {
    path: 'src/utils/index.ts',
    load: () => import('@core/utils'),
    expectedExports: ['formatAddress', 'logger'],
  },
] as const;

describe('public runtime barrels', () => {
  // Invariant: every runtime barrel remains executable and exposes representative
  // public bindings. Barrels stay in the production coverage denominator.
  it.each(PUBLIC_BARRELS)(
    '$path exposes its public runtime bindings',
    async ({ load, expectedExports }) => {
      const moduleExports = await load();

      for (const exportName of expectedExports) {
        expect(Object.hasOwn(moduleExports, exportName)).toBe(true);
      }
    },
  );
});
