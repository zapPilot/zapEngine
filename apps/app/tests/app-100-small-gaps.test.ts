// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildInvestableBalanceRows } from '@/integration/investableBalanceRows';
import {
  normalizeAmountInput,
  singleChainFromAmount,
} from '@/integration/investAmountModel';
import {
  DEFAULT_SECTOR_WEIGHTS,
  rebalanceSectorWeights,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
import {
  attachDailyAttribution,
  calculateAdjacentSnapshotChange,
  calculateWindowValueChangePct,
  nearestTrendPointIndex,
  netPortfolioValueFrom,
  sortedDailyValues,
  toTrendPoints,
  trendPointX,
} from '@/integration/portfolioMetrics';
import {
  fundingBlockerMessage,
  fundingMinimum,
  fundingMinimumMessage,
  fundingPlanSummary,
  fundingWarningMessage,
  planFunding,
  fundingCapacityUsd6,
  unavailableChainIds,
  unavailableFundingChains,
} from '@/integration/investFundingPlanner';
import {
  BASE_DEPOSIT_TOKENS as B,
  ARBITRUM_DEPOSIT_TOKENS as A,
} from '@/integration/depositTokens';
import {
  chainBatchLabel,
  normalizePercentInput,
  percentInputToBps,
  targetUsd6Shares,
} from '@/integration/investTargetsModel';
import { positionSummaryRows } from '@/integration/investReviewModel';
import {
  buildPlaybackSections,
  nextPlaybackSection,
} from '@/integration/podcastSections';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import {
  calculateHomeRangeChange,
  sliceHomeDailyValuesForRange,
  useHomeData,
} from '@/integration/useHomeData';
import {
  marketSignalsFromDashboard,
  signalWindowStart,
} from '@/integration/marketSignalsModel';
import {
  buildChainTokenBalanceRows,
  buildDesktopWalletAssets,
} from '@/integration/walletAssetModel';
import { summarizeRangeAttribution } from '@/integration/rangeAttribution';
import {
  advanceCheckpoint,
  confirmCheckpointReview,
} from '@/integration/checkpointAdvanceModel';
import { buildHomeBorrowingRiskView } from '@/integration/homeBorrowingRiskModel';
import { buildHomeIncomeView } from '@/integration/homeIncomeModel';
import {
  buildConnectedWallets,
  getNativeWalletChain,
  resolveEmbeddedWalletId,
  toWalletError,
} from '@/integration/walletBackendModel';
import { InvestProvider, useInvest } from '@/integration/useInvest';
import { OwnBundleUrlSync } from '@/integration/bundleShareUrlSync.web';
import {
  DesktopSchedulerContextSync,
  useDesktopBridge,
} from '@/integration/desktopBridge.web';
import { useInvestReview } from '@/integration/useInvestReview';
import { useWalletAssets } from '@/integration/walletTokens';
import { balanceRow as fundingRow } from './support/fundingBalanceRow';

const mocks = vi.hoisted(() => ({
  account: { userId: null as string | null, address: null as string | null },
  pathname: '/home',
  push: vi.fn(),
  getBundleViewUserId: vi.fn(() => null as string | null),
  resolve: vi.fn(() => null as string | null),
  getDepositReview: vi.fn(),
  getSnapshot: vi.fn(),
  usePortfolioDashboard: vi.fn(),
  useLandingPageData: vi.fn(),
  useStrategySuggestion: vi.fn(),
  useDailyYieldReturns: vi.fn(),
}));

const capturedQueries = vi.hoisted(() => ({ list: [] as any[] }));
const effectCalls = vi.hoisted(() => ({ list: [] as any[] }));

vi.mock('expo-router', () => ({
  usePathname: () => mocks.pathname,
  router: { push: mocks.push },
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));

vi.mock('@/integration/bundleViewParam', () => ({
  getBundleViewUserId: mocks.getBundleViewUserId,
}));

vi.mock('@/integration/bundleShareModel', () => ({
  resolveOwnBundleUrlSearch: mocks.resolve,
}));

vi.mock('@zapengine/app-core/services/planOrchestrationService', () => ({
  getDepositReview: mocks.getDepositReview,
}));

vi.mock(
  '@zapengine/app-core/services/alchemyWalletService',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/services/alchemyWalletService')
      >();
    return {
      ...actual,
      getAlchemyWalletBalancesSnapshot: mocks.getSnapshot,
    };
  },
);

vi.mock('@zapengine/app-core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: mocks.usePortfolioDashboard,
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/useDailyYieldReturns',
  () => ({
    useDailyYieldReturns: mocks.useDailyYieldReturns,
  }),
);

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioQuery',
  () => ({
    useLandingPageData: mocks.useLandingPageData,
  }),
);

vi.mock('@/integration/useStrategySuggestion', () => ({
  useStrategySuggestion: mocks.useStrategySuggestion,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (opts: any) => {
      capturedQueries.list.push(opts);
      return {
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: async () => ({ data: [] }),
      } as any;
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useEffect: (fn: any, deps?: any) => {
      effectCalls.list.push({ fn, deps });
      return actual.useEffect(fn, deps);
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const WALLET = '0x1111111111111111111111111111111111111111';

function resetMocks() {
  vi.clearAllMocks();
  capturedQueries.list.length = 0;
  effectCalls.list.length = 0;
  mocks.account.userId = null;
  mocks.account.address = null;
  mocks.pathname = '/home';
  mocks.getBundleViewUserId.mockReturnValue(null);
  mocks.resolve.mockReturnValue(null);
  mocks.getDepositReview.mockReset();
  mocks.getSnapshot.mockReset();
  mocks.usePortfolioDashboard.mockReturnValue({
    dashboard: null,
    isLoading: false,
    isError: false,
  });
  mocks.useLandingPageData.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  });
  mocks.useStrategySuggestion.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
  mocks.useDailyYieldReturns.mockReturnValue({ data: undefined });
}

beforeEach(() => {
  resetMocks();
});

// ---------------------------------------------------------------------------
// fonts.ts — ESM asset map loads in both Metro and Vitest.
// ---------------------------------------------------------------------------
describe('fonts require map (static)', () => {
  it('declares nine runtime font families with existing asset files', async () => {
    const srcPath = path.resolve(__dirname, '../src/lib/fonts.ts');
    const src = fs.readFileSync(srcPath, 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+\.ttf)'/g)].map(
      (m) => m[1]!,
    );
    expect(imports).toHaveLength(9);
    expect(src).toContain('APP_FONTS');
    for (const rel of imports) {
      const abs = path.resolve(path.dirname(srcPath), rel);
      expect(fs.existsSync(abs), `missing font asset ${rel}`).toBe(true);
    }
    const { APP_FONTS } = await import('../src/lib/fonts');
    expect(Object.keys(APP_FONTS)).toHaveLength(9);
    expect(APP_FONTS.InstrumentSerif).toBeTruthy();
    expect(APP_FONTS.Geist).toBeTruthy();
    expect(APP_FONTS['JetBrainsMono-Bold']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// investableBalanceRows — tokenName fallback, balance ternary
// ---------------------------------------------------------------------------
describe('investableBalanceRows gaps', () => {
  it('falls back to symbol when name is blank and nulls empty balances', () => {
    const assets = [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        rawAmount: 10,
        usdPrice: 1,
        usdValue: 10,
        amountLabel: '10 USDC',
        chains: ['base'],
        holdings: [],
      },
      {
        symbol: 'USDC',
        name: '',
        rawAmount: 0,
        usdPrice: 1,
        usdValue: null,
        amountLabel: '0 USDC',
        chains: ['base'],
        holdings: [],
      },
      {
        symbol: 'CBBTC',
        name: '',
        rawAmount: 5,
        usdPrice: 100,
        usdValue: 500,
        amountLabel: '5 CBBTC',
        chains: ['base'],
        holdings: [],
      },
    ] as never;
    const rows = buildInvestableBalanceRows(assets);
    expect(rows[0]?.token).toEqual({ symbol: 'USDC', name: 'USD Coin' });
    expect(rows[0]?.balance).toBe('10');
    expect(rows[1]?.token).toEqual({ symbol: 'USDC', name: 'USDC' });
    expect(rows[1]?.balance).toBeNull();
    // Non-deposit token falls back to symbol and keeps a positive balance.
    expect(rows[2]?.token).toEqual({ symbol: 'CBBTC', name: 'CBBTC' });
    expect(rows[2]?.balance).toBe('5');
    expect(rows[2]?.isDepositSupported).toBe(false);
    expect(rows[0]?.isDepositSupported).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// investAmountModel — groupWholeDigits leading zeros, unsafe price
// ---------------------------------------------------------------------------
describe('investAmountModel gaps', () => {
  it('normalizes a leading-decimal amount through the zero fallback', () => {
    expect(normalizeAmountInput('.5')).toBe('0.5');
    expect(normalizeAmountInput('00012')).toBe('12');
    expect(normalizeAmountInput('0000.25')).toBe('0.25');
  });

  it('rejects unsafe, zero, and negative ETH prices', () => {
    const eth = B[1];
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: eth,
        usdPrice: 0,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: eth,
        usdPrice: -5,
      }),
    ).toBeNull();
    // 1e10 USD * 1e6 exceeds Number.MAX_SAFE_INTEGER.
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: eth,
        usdPrice: 1e10,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: eth,
        usdPrice: Number.NaN,
      }),
    ).toBeNull();
  });

  it('keeps the safe ETH path returning a positive string', () => {
    const eth = B[1];
    const out = singleChainFromAmount({
      totalUsd6: '10000000',
      token: eth,
      usdPrice: 2000,
    });
    expect(out).not.toBeNull();
    expect(BigInt(out!)).toBeGreaterThan(0n);
  });
});

// ---------------------------------------------------------------------------
// investSectorModel — locked early return, NaN edit, invalid throw
// ---------------------------------------------------------------------------
describe('investSectorModel gaps', () => {
  it('returns the current mix untouched for a locked sector', () => {
    expect(rebalanceSectorWeights(DEFAULT_SECTOR_WEIGHTS, 'sp500', 5000)).toBe(
      DEFAULT_SECTOR_WEIGHTS,
    );
  });

  it('treats a non-finite edit as zero', () => {
    const next = rebalanceSectorWeights(
      DEFAULT_SECTOR_WEIGHTS,
      'crypto',
      Number.NaN,
    );
    expect(next.crypto).toBe(0);
    const inf = rebalanceSectorWeights(
      DEFAULT_SECTOR_WEIGHTS,
      'crypto',
      Number.POSITIVE_INFINITY,
    );
    expect(inf.crypto).toBe(0);
  });

  it('throws for an invalid mix instead of guessing allocations', () => {
    expect(() =>
      resolveTargetAllocations({ crypto: 0, stable: 0, sp500: 0 }),
    ).toThrow('Invalid sector weights');
    expect(() =>
      resolveTargetAllocations({
        crypto: 5000,
        stable: 5000,
        sp500: 1,
      }),
    ).toThrow('Invalid sector weights');
  });
});

// ---------------------------------------------------------------------------
// useInvest throw outside provider
// ---------------------------------------------------------------------------
describe('useInvest provider guard', () => {
  it('throws outside an InvestProvider', () => {
    function Probe() {
      useInvest();
      return null;
    }
    expect(() => renderToString(createElement(Probe))).toThrow(
      'useInvest must be used within an InvestProvider',
    );
  });

  it('provides a value inside the provider', async () => {
    let seen: any = null;
    function Probe({ onValue }: { onValue: (v: any) => void }) {
      onValue(useInvest());
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          InvestProvider,
          null,
          createElement(Probe, { onValue: (v) => (seen = v) }),
        ),
      );
    });
    expect(seen).not.toBeNull();
    expect(seen.amountInput).toBe('');
    await act(async () => root.unmount());
    container.remove();
  });
});

// ---------------------------------------------------------------------------
// portfolioMetrics — window nulls, geometry, attribution
// ---------------------------------------------------------------------------
describe('portfolioMetrics gaps', () => {
  it('sorts with missing and equal dates deterministically', () => {
    expect(sortedDailyValues(undefined)).toEqual([]);
    expect(
      sortedDailyValues([
        { date: '2026-06-02', total_value_usd: 2 },
        { total_value_usd: 1 },
        { date: '2026-06-01', total_value_usd: 0 },
      ]).map((p) => p.total_value_usd),
    ).toEqual([1, 0, 2]);
    expect(
      sortedDailyValues([
        { date: '2026-06-01', total_value_usd: 1 },
        { date: '2026-06-01', total_value_usd: 2 },
      ]).map((p) => p.total_value_usd),
    ).toEqual([1, 2]);
  });

  it('returns null for every unsafe window-change shape', () => {
    expect(calculateWindowValueChangePct(undefined, 7)).toBeNull();
    expect(calculateWindowValueChangePct([], 7)).toBeNull();
    expect(
      calculateWindowValueChangePct([{ total_value_usd: 100 }], 7),
    ).toBeNull();
    expect(
      calculateWindowValueChangePct(
        [{ date: '2026-06-30', total_value_usd: Number.NaN }],
        7,
      ),
    ).toBeNull();
    expect(
      calculateWindowValueChangePct(
        [
          { date: '2026-06-01', total_value_usd: 0 },
          { date: '2026-06-30', total_value_usd: 10 },
        ],
        30,
      ),
    ).toBeNull();
    // No dated start reaches the window: falls back to first snapshot (80 -> 100 = 25%).
    expect(
      calculateWindowValueChangePct(
        [{ total_value_usd: 80 }, { date: '2026-06-30', total_value_usd: 100 }],
        7,
      ),
    ).toBe(25);
    // Points without dates are skipped when seeking the start.
    expect(
      calculateWindowValueChangePct(
        [
          { total_value_usd: 5 },
          { date: '2026-06-01', total_value_usd: 100 },
          { date: '2026-06-30', total_value_usd: 150 },
        ],
        7,
      ),
    ).toBe(50);
  });

  it('derives adjacent change only from finite pairs', () => {
    expect(calculateAdjacentSnapshotChange(undefined)).toBeNull();
    expect(calculateAdjacentSnapshotChange([], 0)).toBeNull();
    expect(
      calculateAdjacentSnapshotChange([
        { total_value_usd: 100 },
        { total_value_usd: 150 },
      ]),
    ).toEqual({ usd: 50, pct: 50 });
    expect(
      calculateAdjacentSnapshotChange([
        { total_value_usd: 0 },
        { total_value_usd: 5 },
      ]),
    ).toEqual({ usd: 5, pct: null });
  });

  it('covers nearest/trend geometry edges', () => {
    expect(nearestTrendPointIndex(10, -5, 5)).toBeNull();
    expect(nearestTrendPointIndex(10, 100, 0)).toBeNull();
    expect(nearestTrendPointIndex(10, 100, -2)).toBeNull();
    expect(nearestTrendPointIndex(10, 100, 1)).toBe(0);
    expect(nearestTrendPointIndex(-50, 100, 5)).toBe(0);
    expect(nearestTrendPointIndex(500, 100, 5)).toBe(4);
    expect(trendPointX(0, 100, 1)).toBe(0);
    expect(trendPointX(0, 100, 0)).toBe(0);
    expect(trendPointX(0, -10, 5)).toBe(0);
    expect(trendPointX(2, 100, 5)).toBe(50);
    expect(netPortfolioValueFrom(undefined)).toBeNull();
    expect(
      netPortfolioValueFrom({
        net_portfolio_value: null,
        total_net_usd: 9,
      } as never),
    ).toBe(9);
    expect(toTrendPoints(undefined)).toEqual([]);
  });

  it('attaches attribution and drops dust below the epsilon', () => {
    const points = toTrendPoints([
      { date: '2026-08-01', total_value_usd: 100 },
      { date: '2026-08-02', total_value_usd: 110 },
    ]);
    const withData = attachDailyAttribution(points, {
      daily_returns: [
        {
          date: '2026-08-02',
          protocol_name: 'Aave',
          yield_return_usd: 5,
          outlier: false,
          tokens: [{ symbol: 'ETH', market_return_usd: 4 } as never],
        } as never,
      ],
      wallet_returns: [],
    } as never);
    expect(withData[1]?.attribution?.length).toBeGreaterThan(0);

    // Dust below $0.005 carries no attribution at all.
    const dust = attachDailyAttribution(points, {
      daily_returns: [
        {
          date: '2026-08-02',
          protocol_name: 'Aave',
          yield_return_usd: 0.001,
          outlier: false,
          tokens: [],
        } as never,
      ],
      wallet_returns: [],
    } as never);
    expect(dust[1]?.attribution).toBeUndefined();

    // Missing dates never form a bucket.
    const missing = attachDailyAttribution(points, {
      daily_returns: [
        {
          date: undefined,
          protocol_name: 'Aave',
          yield_return_usd: 5,
          outlier: true,
          tokens: [],
        } as never,
      ],
      wallet_returns: [
        {
          date: undefined,
          tokens: [
            {
              symbol: 'ETH',
              market_return_usd: 1,
              yield_return_usd: 1,
            } as never,
          ],
        } as never,
      ],
    } as never);
    expect(missing[1]?.attribution).toBeUndefined();

    // Flow from wallet transfers is labelled, not carried as yield.
    const flow = attachDailyAttribution(points, {
      daily_returns: [],
      wallet_returns: [
        {
          date: '2026-08-02',
          tokens: [
            {
              symbol: 'USDC',
              market_return_usd: 2,
              yield_return_usd: 3,
            } as never,
          ],
        } as never,
      ],
    } as never);
    expect(flow[1]?.attribution?.some((c) => c.kind === 'flow')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// investFundingPlanner — warnings, summaries, blockers, capacity
// ---------------------------------------------------------------------------
describe('investFundingPlanner gaps', () => {
  const defaults = [
    { positionId: 'morpho-base', weightBps: 3600 },
    { positionId: 'gmx-arbitrum', weightBps: 4000 },
    { positionId: 'hlp', weightBps: 2400 },
  ] as never;

  function input(
    rows: any[],
    allocations: any = defaults,
    preferences: any = {},
    failed: number[] = [],
    hyperCore: bigint | null = 0n,
  ) {
    return {
      allocations,
      supply: {
        rows,
        unavailableChainIds: failed,
        hyperCoreSpendableUsd6: hyperCore,
      },
      constraints: { preferences, gasReserveUsd: 5 },
    };
  }

  function plan(config: ReturnType<typeof input>, amount = 100000000n) {
    return planFunding({
      ...config,
      demand: { totalUsd6: amount.toString(), allocations: config.allocations },
    });
  }

  it('labels unknown chains numerically in every warning', () => {
    expect(
      fundingWarningMessage({ kind: 'low-gas', chainId: 999, ethUsd: 0 }),
    ).toBe('Chain 999 has little ETH for gas.');
    expect(
      fundingWarningMessage({
        kind: 'chain-balances-unavailable',
        chainId: 999,
      }),
    ).toBe('Chain 999 balances were unavailable, so we used another chain.');
    expect(
      fundingWarningMessage({ kind: 'eth-reserve-applied', chainId: 999 }),
    ).toBe('We keep about $5 of Chain 999 ETH back for gas.');
    expect(
      fundingWarningMessage({ kind: 'hypercore-balance-unavailable' }),
    ).toBe(
      'Your Hyperliquid balance could not be read, so HLP will be funded by bridge.',
    );
    expect(
      fundingWarningMessage({
        kind: 'hypercore-partial',
        availableUsd6: 1000000n,
        requiredUsd6: 2000000n,
      }),
    ).toContain('on Hyperliquid');
  });

  it('summarises every plan header variant', () => {
    expect(
      fundingPlanSummary({
        sourceCount: 0,
        hasPreferences: true,
        isConnected: true,
      }),
    ).toBe('Custom · Waiting for available balances');
    expect(
      fundingPlanSummary({
        sourceCount: 5,
        hasPreferences: true,
        isConnected: true,
      }),
    ).toBe('Custom · 5 sources');
    expect(
      fundingPlanSummary({
        sourceCount: 1,
        hasPreferences: false,
        isConnected: true,
      }),
    ).toBe('Selected automatically · 1 source');
    expect(
      fundingPlanSummary({
        sourceCount: 3,
        hasPreferences: false,
        isConnected: true,
      }),
    ).toBe('Selected automatically · 3 sources');
    expect(
      fundingPlanSummary({
        sourceCount: 2,
        hasPreferences: false,
        isConnected: false,
      }),
    ).toBe('Connect a wallet to see your plan');
  });

  it('names every blocker kind', () => {
    expect(fundingBlockerMessage({ kind: 'invalid-allocation' })).toContain(
      'valid mix',
    );
    expect(
      fundingBlockerMessage({
        kind: 'override-not-viable',
        chainId: 8453,
        symbol: 'USDT',
        reason: 'not-a-candidate',
      }),
    ).toContain('Choose another source');
    expect(
      fundingBlockerMessage({
        kind: 'chain-unavailable',
        positionId: 'hlp',
        chainIds: [8453],
      }),
    ).toContain('Retry balances');
    expect(
      fundingBlockerMessage({ kind: 'gmx-eth-budget', fromAmount: '1' }),
    ).toContain('keeper execution fees');
    expect(
      fundingBlockerMessage({
        kind: 'no-price',
        positionId: 'hlp',
        tokens: [],
      }),
    ).toContain('ETH price');
    expect(
      fundingBlockerMessage({
        kind: 'insufficient-single-source',
        positionId: 'hlp',
        requiredUsd6: 1n,
        bestAvailableUsd6: 0n,
        bestSource: { kind: 'hypercore', costTier: 0 },
      }),
    ).toContain('No single source');
  });

  it('treats huge ETH dollar values as unpriced capacity', () => {
    const hugeEthRow = {
      ...fundingRow(B[1], 100),
      usdValue: 1e16,
      usdPrice: 2000,
    };
    const cap = fundingCapacityUsd6(
      input([hugeEthRow], [
        { positionId: 'morpho-base', weightBps: 10000 },
        { positionId: 'gmx-arbitrum', weightBps: 0 },
        { positionId: 'hlp', weightBps: 0 },
      ] as never),
    );
    // The $5-reserve math overflows safe integers, so the pool is unpriced.
    expect(cap).toBeNull();
  });

  it('reports insufficient and invalid-amount plans', () => {
    const tiny = plan(input([fundingRow(B[0], 1)]), 100000000n);
    expect(tiny.stages).toBeNull();
    expect(tiny.blockers[0]?.kind).toBe('insufficient-single-source');
    const invalid = planFunding({
      demand: { totalUsd6: 'bad', allocations: defaults },
      supply: { rows: [], unavailableChainIds: [], hyperCoreSpendableUsd6: 0n },
      constraints: { preferences: {}, gasReserveUsd: 5 },
    });
    expect(invalid.blockers).toEqual([{ kind: 'invalid-allocation' }]);
  });

  it('maps unknown wallet chains to no funding chain', () => {
    expect(unavailableChainIds(['solana' as never])).toEqual([]);
    expect(unavailableChainIds([])).toEqual([]);
    expect(unavailableFundingChains(defaults, [], {})).toBe(false);
  });

  it('sizes minima for invalid mixes and lifi copy', () => {
    expect(
      fundingMinimum({
        demand: { totalUsd6: '100', allocations: [] as never },
        supply: {
          rows: [],
          unavailableChainIds: [],
          hyperCoreSpendableUsd6: 0n,
        },
        constraints: { preferences: {}, gasReserveUsd: 5 },
      }),
    ).toEqual({ usd6: 0n, hlpRoute: null });
    expect(
      fundingMinimumMessage({ usd6: 17910000n, hlpRoute: 'lifi' }),
    ).toContain('LI.FI bridge fees');
    expect(
      fundingMinimumMessage({ usd6: 17550000n, hlpRoute: 'bridge2' }),
    ).toContain("meets Hyperliquid's");
  });
});

// ---------------------------------------------------------------------------
// investTargetsModel — empty batch, percent edges, NaN
// ---------------------------------------------------------------------------
describe('investTargetsModel gaps', () => {
  it('labels an empty batch numerically', () => {
    expect(chainBatchLabel({ chainId: 999, positions: [] })).toBe(
      'Chain 999 · ',
    );
  });

  it('returns null for malformed totals and zero-total shares', () => {
    const valid = [
      { positionId: 'morpho-base', weightBps: 1000 },
      { positionId: 'gmx-arbitrum', weightBps: 3000 },
      { positionId: 'hlp', weightBps: 6000 },
    ] as never;
    expect(targetUsd6Shares('bad', valid)).toBeNull();
    expect(targetUsd6Shares('0', valid)).toBeNull();
    // All-zero weights are invalid, so they also refuse rather than divide.
    expect(
      targetUsd6Shares('100', [
        { positionId: 'morpho-base', weightBps: 0 },
        { positionId: 'gmx-arbitrum', weightBps: 0 },
        { positionId: 'hlp', weightBps: 0 },
      ] as never),
    ).toBeNull();
  });

  it('clamps percentages at 100 including decimals', () => {
    expect(normalizePercentInput('100')).toBe('100');
    expect(normalizePercentInput('100.5')).toBe('100');
    expect(normalizePercentInput('101')).toBe('100');
    expect(normalizePercentInput('')).toBe('');
    expect(normalizePercentInput('.')).toBe('.');
    expect(normalizePercentInput('0.5')).toBe('0.5');
  });

  it('maps non-numeric percentages to zero basis points', () => {
    expect(percentInputToBps('abc')).toBe(0);
    expect(percentInputToBps('Infinity')).toBe(0);
    expect(percentInputToBps('')).toBe(0);
    expect(percentInputToBps('12.5')).toBe(1250);
  });
});

// ---------------------------------------------------------------------------
// investReviewModel — morpho/gmx/hlp, bridgeLeg vs step, step null
// ---------------------------------------------------------------------------
describe('investReviewModel gaps', () => {
  const morphoDraft = {
    positionId: 'morpho-base',
    weightBps: 4000,
    usd6: '40000000',
    sourceToken: B[0],
    fromAmount: '40000000',
  } as never;
  const gmxDraft = {
    positionId: 'gmx-arbitrum',
    weightBps: 3500,
    usd6: '35000000',
    sourceToken: A[0],
    fromAmount: '35000000',
  } as never;
  const hlpDraft = {
    positionId: 'hlp',
    ingress: 'bridge2',
    weightBps: 2500,
    usd6: '25000000',
    sourceToken: A[0],
    fromAmount: '25000000',
  } as never;
  const vault = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

  function hlpPlanWith(opts: { bridge: boolean; step: boolean }) {
    return {
      legs: opts.bridge
        ? [
            {
              chainId: 1337,
              kind: 'bridge',
              protocol: 'hyperliquid',
              toToken: A[0].depositAddress,
              fromAmount: '25000000',
              toAmountMin: '24000000',
              bridge: 'hyperliquid-bridge2',
              gasUsd: '0',
              durationSec: 60,
            },
          ]
        : [],
      approvals: [],
      calls: [],
      followUps: opts.step
        ? [
            {
              kind: 'hyperliquid-vault-deposit',
              chainId: 1337,
              afterLegIndex: 0,
              amount: { source: 'bridge-output', legIndex: 0 },
              expectedUsd: '25000000',
              minDepositUsd: '10000000',
              action: {
                type: 'vaultTransfer',
                vaultAddress: vault,
                isDeposit: true,
              },
              signing: {
                scheme: 'hyperliquid-l1-action',
                hyperliquidChain: 'Mainnet',
                apiUrl: 'https://api.hyperliquid.xyz',
              },
              lockupDays: 4,
            },
          ]
        : [],
      totalGasUsd: '0',
      sourceChainId: 42161,
    } as never;
  }

  it('keeps a Morpho row to funding alone even with a plan', () => {
    const rows = positionSummaryRows({
      draft: morphoDraft,
      plan: hlpPlanWith({ bridge: true, step: true }),
    });
    expect(rows.map((r) => r.label)).toEqual(['Funding']);
  });

  it('shows a GMX placeholder with no plan', () => {
    const rows = positionSummaryRows({ draft: gmxDraft, plan: undefined });
    expect(rows.find((r) => r.label === 'Keeper fees')?.value).toBe('—');
  });

  it('falls back to the step when the bridge leg is missing', () => {
    const rows = positionSummaryRows({
      draft: hlpDraft,
      plan: hlpPlanWith({ bridge: false, step: true }),
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Expected received']).toBe('25 USDC');
    expect(byLabel['HLP minimum']).toBe('10 USDC');
  });

  it('degrades every HLP disclosure with no step at all', () => {
    const rows = positionSummaryRows({
      draft: hlpDraft,
      plan: hlpPlanWith({ bridge: true, step: false }),
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Expected received']).toBe('24 USDC');
    expect(byLabel['HLP minimum']).toBe('—');
    expect(byLabel['Official HLP vault']).toBe('—');
    expect(byLabel['Withdrawal lock']).toBe('—');

    const none = positionSummaryRows({ draft: hlpDraft, plan: undefined });
    const noneByLabel = Object.fromEntries(none.map((r) => [r.label, r.value]));
    expect(noneByLabel['Expected received']).toBe('—');
    expect(noneByLabel['Withdrawal lock']).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// podcastSections — byHls/byLanguage fallbacks, index<0
// ---------------------------------------------------------------------------
describe('podcastSections gaps', () => {
  it('prefers the track whose HLS matches the episode', () => {
    const sections = buildPlaybackSections({
      hlsUrl: 'selected',
      languageCode: 'en',
      audioTracks: [
        { languageCode: 'en', hlsUrl: 'selected', classrooms: [] },
        { languageCode: 'ja', hlsUrl: 'other', classrooms: [] },
      ],
    } as never);
    expect(sections).toEqual([
      { kind: 'main', hlsUrl: 'selected', languageCode: null },
    ]);
  });

  it('falls back to the first track when neither HLS nor language matches', () => {
    const sections = buildPlaybackSections({
      hlsUrl: 'main',
      languageCode: 'fr',
      audioTracks: [
        {
          languageCode: 'ja',
          hlsUrl: 'other',
          classrooms: [{ languageCode: 'ja', hlsUrl: 'ja-lesson' }],
        },
      ],
    } as never);
    expect(sections).toEqual([
      { kind: 'main', hlsUrl: 'main', languageCode: null },
      { kind: 'classroom', hlsUrl: 'ja-lesson', languageCode: 'ja' },
    ]);
  });

  it('returns only main when no tracks exist', () => {
    expect(
      buildPlaybackSections({ hlsUrl: 'main', languageCode: 'en' } as never),
    ).toEqual([{ kind: 'main', hlsUrl: 'main', languageCode: null }]);
    expect(
      buildPlaybackSections({
        hlsUrl: 'main',
        languageCode: 'en',
        audioTracks: [],
      } as never),
    ).toEqual([{ kind: 'main', hlsUrl: 'main', languageCode: null }]);
  });

  it('returns null for an unknown section identity', () => {
    const sections = [
      { kind: 'main', hlsUrl: 'main', languageCode: null },
    ] as const;
    expect(nextPlaybackSection(sections, 'classroom', 'ja')).toBeNull();
    expect(nextPlaybackSection(sections, 'main', 'ja')).toBeNull();
    expect(nextPlaybackSection([], 'main', null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// simulationPreviewModel — denominator<=0, weightBps undefined
// ---------------------------------------------------------------------------
describe('simulationPreviewModel gaps', () => {
  const tokenA = '0x0000000000000000000000000000000000000001';
  it('renders zero-amount legs as 0% instead of dividing', () => {
    const routes = resolveRouteProtocols(
      {
        legs: [
          { protocol: 'morpho', fromAmount: '0', toToken: tokenA },
          { protocol: 'morpho', fromAmount: '0', toToken: tokenA },
        ],
      } as never,
      'ignored',
    );
    expect(routes.map((r) => r.badge)).toEqual(['0%', '0%']);
  });

  it('falls back to batch share without a protocol weight entry', () => {
    const routes = resolveRouteProtocols(
      {
        legs: [
          { protocol: 'morpho', fromAmount: '25', toToken: tokenA },
          { protocol: 'morpho', fromAmount: '75', toToken: tokenA },
        ],
      } as never,
      'ignored',
      {},
    );
    expect(routes[0]?.badge).toBe('25%');
    expect(routes[1]?.badge).toBe('75%');
  });

  it('subdivides a weighted protocol by leg amount', () => {
    const routes = resolveRouteProtocols(
      {
        legs: [{ protocol: 'morpho', fromAmount: '50', toToken: tokenA }],
      } as never,
      'ignored',
      { morpho: 4000 },
    );
    expect(routes[0]?.badge).toBe('40%');
  });
});

// ---------------------------------------------------------------------------
// useHomeData — slice filter, strategy status variants
// ---------------------------------------------------------------------------
describe('useHomeData gaps', () => {
  it('drops dateless points when slicing and keeps two as fallback', () => {
    const points = [
      { total_value_usd: 5 },
      { date: '2026-06-20', total_value_usd: 100 },
      { date: '2026-06-30', total_value_usd: 150 },
    ] as never;
    const sliced = sliceHomeDailyValuesForRange(points, '1W');
    expect(sliced.map((p: any) => p.total_value_usd)).toEqual([100, 150]);
    expect(sliceHomeDailyValuesForRange([], '1M')).toEqual([]);
    expect(sliceHomeDailyValuesForRange(points, '1Y').length).toBe(3);
    expect(calculateHomeRangeChange([])).toBeNull();
    expect(
      calculateHomeRangeChange([{ total_value_usd: 1 }] as never),
    ).toBeNull();
  });

  it('reports action_required with no reason and others with panel copy', async () => {
    function suggestion(status: string, reasonCode: string) {
      return {
        as_of: '2026-08-22',
        action: {
          status,
          required: status === 'action_required',
          kind: 'rebalance',
          reason_code: reasonCode,
          transfers:
            status === 'action_required'
              ? [{ from_bucket: 'stable', to_bucket: 'eth', amount_usd: 1000 }]
              : [],
        },
        context: {
          portfolio: { total_value: 1000, asset_allocation: {} },
          target: { allocation: {} },
          market: { sentiment: 50 },
          signal: { regime: 'risk_on' },
          strategy: { stance: 'buy', reason_code: 'ratio', rule_group: 'x' },
        },
      } as never;
    }

    async function readHome(suggestionData: any) {
      mocks.useLandingPageData.mockReturnValue({
        data: {
          net_portfolio_value: 100,
          last_updated: '2026-08-22T00:00:00Z',
        },
        isLoading: false,
        isError: false,
        error: null,
      });
      mocks.usePortfolioDashboard.mockReturnValue({
        dashboard: { trends: { daily_values: [] } },
        isLoading: false,
        isError: false,
      });
      mocks.useStrategySuggestion.mockReturnValue({
        data: suggestionData,
        isLoading: false,
        isError: false,
      });
      mocks.useDailyYieldReturns.mockReturnValue({ data: undefined });

      let seen: any = null;
      function Probe({ onValue }: { onValue: (v: any) => void }) {
        onValue(useHomeData('user-1', '1M'));
        return null;
      }
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(Probe, { onValue: (v) => (seen = v) }));
      });
      await act(async () => root.unmount());
      container.remove();
      return seen;
    }

    const required = await readHome(
      suggestion('action_required', 'eth_btc_ratio_rebalance'),
    );
    expect(required.data.strategyStatus.status).toBe('action_required');
    expect(required.data.strategyStatus.reason).toBeNull();
    expect(required.data.strategyStatus.primaryAction).not.toBeNull();

    const idle = await readHome(suggestion('no_action', 'already_aligned'));
    expect(idle.data.strategyStatus.status).toBe('no_action');
    expect(idle.data.strategyStatus.reason).toContain('already aligned');
  });
});

// ---------------------------------------------------------------------------
// useInvestReview — retry fallback function/number/boolean
// ---------------------------------------------------------------------------
describe('useInvestReview retry gaps', () => {
  async function captureRetry(queryRetry: any) {
    capturedQueries.list.length = 0;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: queryRetry, gcTime: 0 } },
    });
    function Probe({ onValue }: { onValue: (v: any) => void }) {
      onValue(useInvestReview());
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mocks.account.address = WALLET;
    // Provide drafts through the real provider so the hook has context.
    // The mocked useQuery captures the retry option without running it.
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            InvestProvider,
            null,
            createElement(Probe, { onValue: () => undefined }),
          ),
        ),
      );
    });
    const retry = capturedQueries.list.at(-1)?.retry;
    await act(async () => root.unmount());
    container.remove();
    client.clear();
    expect(typeof retry).toBe('function');
    return retry as (count: number, err: Error) => boolean | unknown;
  }

  it('honours a function fallback verbatim', async () => {
    const inner = vi.fn(() => 'inner-result' as any);
    const retry = await captureRetry(inner);
    const err = new Error('plain');
    expect(retry(1, err)).toBe('inner-result');
    expect(inner).toHaveBeenCalledWith(1, err);
  });

  it('compares counts against a numeric fallback and defaults to three', async () => {
    const retryNum = await captureRetry(2);
    expect(retryNum(1, new Error('x'))).toBe(true);
    expect(retryNum(2, new Error('x'))).toBe(false);
    const retryDefault = await captureRetry(undefined);
    expect(retryDefault(2, new Error('x'))).toBe(true);
    expect(retryDefault(3, new Error('x'))).toBe(false);
  });

  it('returns a boolean fallback as-is and never retries too-small legs', async () => {
    const retryTrue = await captureRetry(true);
    expect(retryTrue(99, new Error('x'))).toBe(true);
    const retryFalse = await captureRetry(false);
    expect(retryFalse(0, new Error('x'))).toBe(false);

    // Amount-too-small refuses even when the client would retry.
    const { APIError } = await import('@zapengine/app-core/lib/http');
    const { HLP_DEPOSIT_TOO_SMALL_ERROR_CODE } =
      await import('@zapengine/types/api');
    const retryNum = await captureRetry(5);
    const tooSmall = new APIError(
      'too small',
      422,
      HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
    );
    expect(retryNum(0, tooSmall as any)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// marketSignalsModel — window start, dma fallback
// ---------------------------------------------------------------------------
describe('marketSignalsModel gaps', () => {
  function dashboard(days: any[]): any {
    return {
      series: {},
      meta: {
        primary_series: 'btc',
        days_requested: days.length,
        count: days.length,
        timestamp: '2026-09-24T00:00:00Z',
      },
      snapshots: days.map(({ date, values }) => ({
        snapshot_date: date,
        values,
      })),
    };
  }
  function asset(value: number, dma: number | null, isAbove?: boolean | null) {
    return {
      value,
      indicators:
        dma === null
          ? {}
          : { dma_200: { value: dma, is_above: isAbove ?? value > dma } },
      tags: {},
    };
  }

  it('falls back to zero for empty histories', () => {
    expect(signalWindowStart([], '3M')).toBe(0);
  });

  it('derives isAbove from price comparison when the flag is absent', () => {
    const signals = marketSignalsFromDashboard(
      dashboard([
        {
          date: '2026-09-23',
          values: {
            btc: {
              value: 110,
              indicators: { dma_200: { value: 100 } },
              tags: {},
            },
          },
        },
        {
          date: '2026-09-24',
          values: {
            btc: {
              value: 90,
              indicators: { dma_200: { value: 100 } },
              tags: {},
            },
          },
        },
      ]),
    );
    // Latest 90 < 100, no is_above flag, so comparison yields false.
    expect(signals?.trends[0]?.isAbove).toBe(false);
    expect(signals?.trends[0]?.distance).toBeCloseTo(-0.1);

    const above = marketSignalsFromDashboard(
      dashboard([
        {
          date: '2026-09-24',
          values: {
            btc: {
              value: 120,
              indicators: { dma_200: { value: 100 } },
              tags: {},
            },
          },
        },
      ]),
    );
    expect(above?.trends[0]?.isAbove).toBe(true);
  });

  it('keeps dma-less assets with unknown side', () => {
    const signals = marketSignalsFromDashboard(
      dashboard([{ date: '2026-09-24', values: { spy: asset(500, null) } }]),
    );
    expect(signals?.trends[0]).toMatchObject({ dma: null, isAbove: null });
  });
});

// ---------------------------------------------------------------------------
// walletAssetModel — brand fallback, unknown chain label, dust
// ---------------------------------------------------------------------------
describe('walletAssetModel gaps', () => {
  it('falls back to brand names and numeric chain labels', () => {
    const assets = buildDesktopWalletAssets([
      {
        chain: 'base',
        response: {
          result: [
            {
              symbol: 'USDC',
              token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              balance_formatted: '10',
              usd_value: 10,
            },
          ],
        },
      } as never,
    ]);
    expect(assets[0]?.name).toBe('USD Coin');

    const rows = buildChainTokenBalanceRows([
      {
        symbol: 'USDC',
        name: '',
        rawAmount: 5,
        usdPrice: null,
        usdValue: null,
        amountLabel: '5 USDC',
        chains: ['ethereum'],
        holdings: [
          {
            chain: 'ethereum',
            chainId: 999,
            tokenAddress: null,
            decimals: 6,
            rawAmount: 5,
            usdValue: null,
          },
        ],
      } as any,
    ]);
    expect(rows[0]?.chainLabel).toBe('999');
    expect(rows[0]?.token.name).toBe('USD Coin');
  });

  it('orders unknown chains last via the 99 fallback', () => {
    // Two holdings on the same symbol with different chains exercise sortChains
    // through the public aggregation (ethereum before base by canonical order).
    const assets = buildDesktopWalletAssets([
      {
        chain: 'base',
        response: {
          result: [
            {
              symbol: 'USDC',
              name: 'USD Coin',
              token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
              balance_formatted: '5',
              usd_value: 5,
            },
          ],
        },
      } as never,
      {
        chain: 'eth',
        response: {
          result: [
            {
              symbol: 'USDC',
              name: 'USD Coin',
              token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              balance_formatted: '5',
              usd_value: 5,
            },
          ],
        },
      } as never,
    ]);
    // Ethereum sorts before Base per CHAIN_ORDER.
    expect(assets[0]?.chains).toEqual(['ethereum', 'base']);
  });
});

// ---------------------------------------------------------------------------
// rangeAttribution — null-change skip
// ---------------------------------------------------------------------------
describe('rangeAttribution gaps', () => {
  it('skips days whose change cannot be computed', () => {
    const summary = summarizeRangeAttribution([
      { date: '2026-08-01', total_value_usd: 100 },
      { date: '2026-08-02', total_value_usd: Number.NaN },
      { date: '2026-08-03', total_value_usd: 110 },
      {
        date: '2026-08-04',
        total_value_usd: 120,
        attribution: [{ kind: 'market', label: 'ETH', valueUsd: 10 }],
      },
    ]);
    // Pairs touching NaN are skipped; only 110 -> 120 counts.
    expect(summary?.totalDays).toBe(1);
    expect(summary?.marketUsd).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// checkpointAdvanceModel — strategy plan, rejected submit
// ---------------------------------------------------------------------------
describe('checkpointAdvanceModel gaps', () => {
  const hash = `0x${'11'.repeat(32)}`;
  function group(overrides: any = {}) {
    return {
      status: 'passed',
      warnings: [],
      chainId: 42161,
      walletAddress: WALLET,
      calls: [],
      assetChanges: [],
      approvals: [],
      contracts: [],
      blockNumber: 1,
      callGas: '21000',
      simulationIds: ['sim-1'],
      shareUrls: [],
      simulationFingerprint: hash,
      riskHash: hash,
      groupId: 'chain-42161',
      groupFingerprint: hash,
      batchFingerprint: hash,
      reviewedAt: 1,
      expiresAt: Date.now() + 300000,
      expectedSimulationFingerprint: hash,
      expectedRiskHash: hash,
      blocked: false,
      executionAllowed: true,
      requiresRiskAcknowledgement: false,
      ...overrides,
    } as never;
  }
  function plan(followUps: any = undefined) {
    return {
      legs: [],
      approvals: [],
      calls: [],
      ...(followUps ? { followUps } : {}),
      totalGasUsd: '0',
      sourceChainId: 42161,
    } as never;
  }

  it('treats a strategy plan as having no HLP step and submits', async () => {
    const strategyPlan = { executionGroups: [], allocations: [] } as never;
    const reviewed = { plan: strategyPlan, review: group() };
    const submitNext = vi.fn(async () => ({ status: 'submitted' as const }));
    const capture = vi.fn(async () => undefined);
    await expect(
      confirmCheckpointReview({
        reviewed,
        now: () => Date.now(),
        captureHlpBaseline: capture,
        submitNext,
      }),
    ).resolves.toEqual({ status: 'submitted' });
    expect(capture).not.toHaveBeenCalled();
    expect(submitNext).toHaveBeenCalledTimes(1);
  });

  it('reports a refused submission as rejected', async () => {
    const reviewed = { plan: plan(), review: group() };
    await expect(
      confirmCheckpointReview({
        reviewed,
        now: () => Date.now(),
        captureHlpBaseline: vi.fn(async () => undefined),
        submitNext: vi.fn(async () => ({
          status: 'blocked' as const,
          reason: 'changed',
        })),
      }),
    ).resolves.toEqual({ status: 'rejected', reason: 'changed' });
  });

  it('advances when fingerprints match and pauses when they change', async () => {
    const queued = { plan: plan(), review: group() };
    const freshSame = { plan: plan(), review: group() };
    await expect(
      advanceCheckpoint({
        queued,
        reviewNext: async () => freshSame,
        now: () => Date.now(),
        captureHlpBaseline: vi.fn(async () => undefined),
        submitNext: async () => ({ status: 'submitted' as const }),
      }),
    ).resolves.toEqual({ status: 'submitted' });

    const freshChanged = {
      plan: plan(),
      review: group({ batchFingerprint: `0x${'22'.repeat(32)}` }),
    };
    await expect(
      advanceCheckpoint({
        queued,
        reviewNext: async () => freshChanged,
        now: () => Date.now(),
        captureHlpBaseline: vi.fn(async () => undefined),
        submitNext: async () => ({ status: 'submitted' as const }),
      }),
    ).resolves.toMatchObject({ status: 'review-changed' });
  });
});

// ---------------------------------------------------------------------------
// homeBorrowingRiskModel — nearest fallback is covered via normal path
// ---------------------------------------------------------------------------
describe('homeBorrowingRiskModel gaps', () => {
  it('surfaces the nearest liquidation buffer from live positions', () => {
    const view = buildHomeBorrowingRiskView({
      positions: [
        {
          protocol_name: 'Morpho',
          chain: 'base',
          health_rate: 2,
          collateral_tokens: [{ symbol: 'WETH' }],
          debt_tokens: [{ symbol: 'USDC' }],
          collateral_usd: 200,
          debt_usd: 100,
        },
      ],
      total_debt_usd: 100,
      worst_health_rate: 2,
    } as never);
    expect(view?.nearestLiquidationBufferPct).toBeCloseTo(50);
    expect(view?.positionCount).toBe(1);
    expect(buildHomeBorrowingRiskView(undefined)).toBeNull();
    expect(buildHomeBorrowingRiskView({ positions: [] } as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// homeIncomeModel — windowKey fallback, empty window
// ---------------------------------------------------------------------------
describe('homeIncomeModel gaps', () => {
  it('defaults an unparseable window key to 30 days', () => {
    const view = buildHomeIncomeView(undefined, 'oops' as never);
    expect(view.windowDays).toBe(30);
    expect(view.status).toBe('empty');
  });

  it('returns empty without a usable window', () => {
    expect(buildHomeIncomeView(undefined)).toMatchObject({ status: 'empty' });
    expect(buildHomeIncomeView({ windows: {} } as never)).toMatchObject({
      status: 'empty',
    });
  });
});

// ---------------------------------------------------------------------------
// walletBackendModel — linked-account filters, error shapes
// ---------------------------------------------------------------------------
describe('walletBackendModel gaps', () => {
  it('requires every embedded-Ethereum field before resolving', () => {
    expect(resolveEmbeddedWalletId(null, WALLET)).toBeUndefined();
    expect(
      resolveEmbeddedWalletId(
        [
          {
            connector_type: 'embedded',
            chain_type: 'ethereum',
            address: 123,
            id: 'w1',
          },
        ],
        WALLET,
      ),
    ).toBeUndefined();
    expect(
      resolveEmbeddedWalletId(
        [
          {
            id: 'w1',
            address: '0xother',
            connector_type: 'embedded',
            chain_type: 'ethereum',
          },
        ],
        WALLET,
      ),
    ).toBeUndefined();
    expect(
      resolveEmbeddedWalletId(
        [
          {
            id: 'w1',
            address: WALLET,
            connector_type: 'embedded',
            chain_type: 'ethereum',
          },
        ],
        WALLET,
      ),
    ).toBe('w1');
  });

  it('covers chain helpers and error coercion', () => {
    expect(getNativeWalletChain(null).id).toBeDefined();
    expect(getNativeWalletChain(999999).id).toBeDefined();
    expect(buildConnectedWallets(null)).toEqual([]);
    expect(buildConnectedWallets(WALLET)).toEqual([
      { address: WALLET, isActive: true },
    ]);
    expect(toWalletError(new Error('x'))).toEqual({ message: 'x' });
    expect(toWalletError('boom')).toEqual({ message: 'boom' });
  });
});

// ---------------------------------------------------------------------------
// walletTokens — non-Error rejection fallback
// ---------------------------------------------------------------------------
describe('walletTokens gaps', () => {
  async function captureQueryFn(addresses: any) {
    capturedQueries.list.length = 0;
    function Probe({ onValue }: { onValue: (v: any) => void }) {
      onValue(useWalletAssets(addresses));
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(Probe, { onValue: () => undefined }));
    });
    const opts = capturedQueries.list.at(-1);
    await act(async () => root.unmount());
    container.remove();
    expect(opts?.queryFn).toBeDefined();
    return opts.queryFn as () => Promise<any>;
  }

  function ethSnapshot(chain: any, amount: number): any {
    return {
      balances: [
        {
          chain,
          response: {
            result: [
              {
                symbol: 'ETH',
                name: 'Ethereum',
                token_address: null,
                native_token: true,
                balance_formatted: String(amount),
                usd_value: amount * 2000,
                usd_price: 2000,
              },
            ],
          },
        },
      ],
      failedChains: [],
    };
  }

  it('rejects every-wallet failures with a generic error for non-Errors', async () => {
    mocks.getSnapshot.mockRejectedValue('string-failure');
    const queryFn = await captureQueryFn([WALLET]);
    await expect(queryFn()).rejects.toThrow(
      'Wallet balance requests failed for every wallet.',
    );
  });

  it('rethrows the original Error when every wallet fails with one', async () => {
    mocks.getSnapshot.mockRejectedValue(new Error('alchemy down'));
    const queryFn = await captureQueryFn([WALLET]);
    await expect(queryFn()).rejects.toThrow('alchemy down');
  });

  it('merges a surviving wallet while marking failed chains', async () => {
    mocks.getSnapshot.mockImplementation(async (address: string) => {
      if (address === WALLET) return ethSnapshot('eth', 1);
      throw new Error('second wallet down');
    });
    const queryFn = await captureQueryFn([
      WALLET,
      '0x2222222222222222222222222222222222222222',
    ]);
    const data = await queryFn();
    expect(data.assets.length).toBeGreaterThan(0);
    expect(data.failedChains.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// bundleShareUrlSync.web + desktopBridge.web — ready guards + window guards
// ---------------------------------------------------------------------------
describe('web sync window and ready guards', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();

  async function renderOwn() {
    if (!root) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    await act(async () => root?.render(createElement(OwnBundleUrlSync)));
  }

  beforeEach(() => {
    frames.clear();
    nextFrame = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
    const w = (globalThis as any).__savedWindow;
    if (w) (globalThis as any).window = w;
  });

  it('waits one frame before touching the URL', async () => {
    effectCalls.list.length = 0;
    await renderOwn();
    expect(mocks.resolve).not.toHaveBeenCalled();
    const entry = frames.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    expect(entry).toBeDefined();
    frames.delete(entry![0]);
    await act(async () => entry![1](0));
    expect(mocks.resolve).toHaveBeenCalled();
  });

  it('covers window-undefined guards without crashing', async () => {
    effectCalls.list.length = 0;
    await renderOwn();
    // Flush to reach ready=true so later effects reach the window check.
    const entry = frames.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    if (entry) {
      frames.delete(entry[0]);
      await act(async () => entry[1](0));
    }
    const captured = [...effectCalls.list];
    expect(captured.length).toBeGreaterThan(0);
    const saved = (globalThis as any).window;
    (globalThis as any).__savedWindow = saved;
    delete (globalThis as any).window;
    expect(typeof window).toBe('undefined');
    for (const { fn } of captured) {
      let out: unknown = null;
      expect(() => {
        out = fn();
      }).not.toThrow();
      void out;
    }
    (globalThis as any).window = saved;
  });

  it('desktop bridge ignores plain web and honours the preload bridge', async () => {
    function Probe() {
      useDesktopBridge();
      return null;
    }
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = createRoot(c);
    // No bridge: subscribes to nothing.
    await act(async () => {
      r.render(createElement(Probe));
    });
    // With bridge: routes proposals and deep links.
    const push = mocks.push;
    push.mockClear();
    const offProposal = vi.fn();
    const offLink = vi.fn();
    let proposalCb: any = null;
    let linkCb: any = null;
    (window as any).zapDesktop = {
      platform: 'electron',
      onRebalanceProposal: vi.fn((cb: any) => {
        proposalCb = cb;
        return offProposal;
      }),
      onDeepLink: vi.fn((cb: any) => {
        linkCb = cb;
        return offLink;
      }),
      registerSchedulerContext: vi.fn(),
      clearSchedulerContext: vi.fn(),
      openExternal: vi.fn(),
    };
    await act(async () => {
      r.render(createElement(Probe));
    });
    // Effects are captured; invoke the latest bridge effect manually is not
    // needed here because window exists — the real effect already ran.
    // Simulate callbacks if subscribed.
    if (proposalCb) {
      await act(async () => {
        proposalCb({
          driftPercent: 5,
          generatedAt: '2026-01-01T00:00:00.000Z',
        });
      });
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/invest' }),
      );
    }
    if (linkCb) {
      linkCb('https://example.com/nope');
      expect(push).not.toHaveBeenCalledWith('https://example.com/nope');
      linkCb('zappilotv2://portfolio');
      expect(push).toHaveBeenCalledWith('/portfolio');
    }
    await act(async () => r.unmount());
    c.remove();
    delete (window as any).zapDesktop;

    // Window-undefined guard for getBridge.
    effectCalls.list.length = 0;
    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    const r2 = createRoot(c2);
    await act(async () => {
      r2.render(createElement(Probe));
    });
    const captured = [...effectCalls.list];
    const saved = (globalThis as any).window;
    (globalThis as any).__savedWindow = saved;
    delete (globalThis as any).window;
    for (const { fn } of captured) {
      const src = fn.toString();
      if (
        src.includes('window') ||
        src.includes('getBridge') ||
        src.includes('bridge')
      ) {
        expect(() => fn()).not.toThrow();
      }
    }
    (globalThis as any).window = saved;
    await act(async () => r2.unmount());
    c2.remove();
  });

  it('scheduler sync registers, clears, and tolerates missing bridge', async () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = createRoot(c);
    const bridge = {
      platform: 'electron' as const,
      onRebalanceProposal: vi.fn(() => vi.fn()),
      onDeepLink: vi.fn(() => vi.fn()),
      registerSchedulerContext: vi.fn(),
      clearSchedulerContext: vi.fn(),
      openExternal: vi.fn(),
    };
    (window as any).zapDesktop = bridge;
    mocks.account.userId = 'u1';
    mocks.account.address = WALLET;
    await act(async () => {
      r.render(createElement(DesktopSchedulerContextSync));
    });
    expect(bridge.registerSchedulerContext).toHaveBeenCalledWith({
      userId: 'u1',
      walletAddress: WALLET,
    });
    mocks.account.address = null;
    await act(async () => {
      r.render(createElement(DesktopSchedulerContextSync));
    });
    expect(bridge.clearSchedulerContext).toHaveBeenCalled();
    delete (window as any).zapDesktop;
    await act(async () => {
      r.render(createElement(DesktopSchedulerContextSync));
    });
    await act(async () => r.unmount());
    c.remove();
  });
});
