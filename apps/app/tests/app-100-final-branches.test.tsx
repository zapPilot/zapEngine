// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  DepositPlan,
  DepositReviewGroup,
  PreparedTransaction,
} from '@zapengine/types/api';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BASE_DEPOSIT_TOKENS,
  ARBITRUM_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import {
  fundingMinimum,
  planFunding,
} from '@/integration/investFundingPlanner';
import {
  normalizePercentInput,
  type StageDraft,
} from '@/integration/investTargetsModel';
import { attachDailyAttribution } from '@/integration/portfolioMetrics';
import { strategyStatusFromSuggestion } from '@/integration/useHomeData';
import { useAccount as useIosAccount } from '@/integration/useAccount.ios';
import type { HyperCoreFundingDraft } from '@/integration/useInvest';
import {
  InvestExecutionProvider,
  useInvestExecution,
  type InvestExecutionContextValue,
} from '@/integration/useInvestExecution';
import { balanceRow as row } from './support/fundingBalanceRow';

vi.mock('@zapengine/app-core/services/suggestion', () => ({
  buildTradeActions: () => [],
  formatRegimeLabel: (value: string) => value,
  getStatusPanelContent: () => ({ bodyDescription: 'panel copy' }),
}));

const mocks = vi.hoisted(() => ({
  privy: {
    isReady: true,
    user: null as null | { linked_accounts?: unknown[] },
    logout: vi.fn(),
  },
  loginFn: vi.fn(),
  getUserByWallet: vi.fn(),
  getUserProfile: vi.fn(),
  readWatch: vi.fn(),
  watchListener: null as null | ((address: string | null) => void),
  unsubscribe: vi.fn(),
  investExecute: vi.fn(),
  investWait: vi.fn(),
  trackEvent: vi.fn(),
  invest: {
    stageDrafts: [] as StageDraft[],
    hyperCoreFundingDraft: null as HyperCoreFundingDraft | null,
  },
  execAccount: {
    userId: 'user-1' as string | null,
    walletAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] as string[],
  },
  execWallet: {
    account: {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      isConnected: true,
    } as { address: string; isConnected: boolean } | null,
    isConnected: true,
    executionMode: 'eip7702' as 'atomic-batch' | 'eip7702' | undefined,
    executeReviewedBatch: vi.fn() as
      | ((...args: never[]) => Promise<never>)
      | undefined,
    waitForReviewedBatch: vi.fn() as
      | ((...args: never[]) => Promise<never>)
      | undefined,
  },
}));

vi.mock('@privy-io/expo', () => ({
  usePrivy: () => mocks.privy,
}));

vi.mock('@privy-io/expo/ui', () => ({
  useLogin: () => ({ login: mocks.loginFn }),
}));

vi.mock('@zapengine/app-core/services/accountService', () => ({
  getUserByWallet: mocks.getUserByWallet,
  getUserProfile: mocks.getUserProfile,
}));

vi.mock('@/integration/iosWatchPortfolioAddress', () => ({
  readIosWatchPortfolioAddress: (...args: unknown[]) =>
    (mocks.readWatch as (...a: unknown[]) => Promise<string | null>)(...args),
  subscribeIosWatchPortfolioAddress: (
    listener: (address: string | null) => void,
  ) => {
    mocks.watchListener = listener;
    return () => {
      mocks.unsubscribe();
      if (mocks.watchListener === listener) mocks.watchListener = null;
    };
  },
}));

vi.mock('@zapengine/app-core/lib/state/queryClient', () => ({
  queryKeys: {
    portfolio: { all: ['portfolio'] },
    portfolioDashboard: {
      byUser: (userId: string) => ['portfolio-dashboard', userId],
    },
    dailyYield: { byUser: (userId: string) => ['dailyYield', userId] },
    desktop: {
      portfolio: {
        dailyYieldByUser: (userId: string) => [
          'desktop',
          'portfolio',
          'dailyYield',
          userId,
        ],
      },
      strategySuggestion: (userId: string) => [
        'desktop',
        'strategy-suggestion',
        userId,
      ],
      walletAssets: (walletAddresses: readonly string[]) => [
        'desktop',
        'alchemy',
        'wallet-assets',
        walletAddresses,
      ],
    },
  },
}));

vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.execWallet,
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.execAccount,
}));

vi.mock('@/integration/useInvest', () => ({
  useInvest: () => mocks.invest,
}));

vi.mock('@/observability/analytics', () => ({
  trackEvent: mocks.trackEvent,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ALLOCATIONS = [
  { positionId: 'morpho-base', weightBps: 3600 },
  { positionId: 'gmx-arbitrum', weightBps: 4000 },
  { positionId: 'hlp', weightBps: 2400 },
] as const;

function planInput(rows: ReturnType<typeof row>[], totalUsd6: string) {
  return {
    demand: { totalUsd6, allocations: [...ALLOCATIONS] },
    supply: {
      rows,
      unavailableChainIds: [],
      hyperCoreSpendableUsd6: 0n,
    },
    constraints: { preferences: {}, gasReserveUsd: 5 },
  } as never;
}

// ---------------------------------------------------------------------------
// investFundingPlanner: per-candidate insufficient + malformed minimum total
// ---------------------------------------------------------------------------

describe('app-100 final: funding planner edges', () => {
  it('marks candidates insufficient when no balance covers the share', () => {
    const result = planFunding(planInput([], '100000000'));
    expect(
      result.options['morpho-base']?.some(
        (o) => o.rejection === 'insufficient',
      ),
    ).toBe(true);
  });

  it('sizes the minimum from the floor when the entered total is malformed', () => {
    const malformed = fundingMinimum(planInput([], 'not-a-number'));
    expect(malformed.usd6 > 0n).toBe(true);
    // A malformed total probes at the floor, matching an explicit floor total.
    const floorTotal = '10530000';
    expect(fundingMinimum(planInput([], floorTotal)).usd6).toBe(malformed.usd6);
  });

  it('marks an affordable ETH source no-price when its price is unreadable', () => {
    const eth = ARBITRUM_DEPOSIT_TOKENS.find((t) => t.symbol === 'ETH')!;
    const unreadablePrice = {
      id: `${eth.chainId}:ETH`,
      chain: eth.chainKey,
      chainLabel: eth.chainKey,
      chainId: eth.chainId,
      tokenAddress: eth.balanceAddress,
      decimals: eth.decimals,
      balance: '1',
      balanceBaseUnits: '1000000000000000000',
      usdValue: 2000,
      usdPrice: Number.NaN,
      token: { symbol: eth.symbol, name: eth.name },
    } as never;
    const result = planFunding(planInput([unreadablePrice], '10000000'));
    expect(
      result.options['gmx-arbitrum']?.some(
        (o) =>
          o.candidate.kind === 'evm' &&
          o.candidate.token.symbol === 'ETH' &&
          o.rejection === 'no-price',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// investTargetsModel: whole-number percent without a decimal point
// ---------------------------------------------------------------------------

describe('app-100 final: percent input edges', () => {
  it('keeps a whole-number percent editable without a decimal', () => {
    expect(normalizePercentInput('12')).toBe('12');
  });
});

// ---------------------------------------------------------------------------
// portfolioMetrics: snapshots without a date carry no proven attribution
// ---------------------------------------------------------------------------

describe('app-100 final: attribution edges', () => {
  it('skips proven lookup for snapshots without a date', () => {
    const points = attachDailyAttribution([{ total_value_usd: 100 }], {
      daily_returns: [
        {
          date: '2026-01-03',
          protocol_name: 'morpho',
          yield_return_usd: 1,
          outlier: false,
          tokens: [],
        },
      ],
      wallet_returns: [],
    } as never);
    expect(points).toHaveLength(1);
    expect(points[0]).not.toHaveProperty('attribution');
  });
});

// ---------------------------------------------------------------------------
// useHomeData: strategy fear/greed falls back to null when missing
// ---------------------------------------------------------------------------

describe('app-100 final: strategy status sentiment', () => {
  function suggestion(sentiment: unknown) {
    return {
      action: { status: 'no_action' },
      context: {
        signal: { regime: 'calm' },
        market: { sentiment },
      },
    } as never;
  }

  it('maps a missing sentiment to null fear/greed', () => {
    const result = strategyStatusFromSuggestion(suggestion(null));
    expect(result.fearGreed).toBeNull();
    expect(result.reason).toBe('panel copy');
  });

  it('forwards a present sentiment value', () => {
    expect(strategyStatusFromSuggestion(suggestion(72)).fearGreed).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// useAccount.ios: async race guards
// ---------------------------------------------------------------------------

function CaptureIos({
  onAccount,
}: {
  onAccount: (account: ReturnType<typeof useIosAccount>) => void;
}): ReactElement | null {
  onAccount(useIosAccount());
  return null;
}

async function renderIosAccount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let latest: ReturnType<typeof useIosAccount> | undefined;
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(CaptureIos, {
        onAccount: (value) => {
          latest = value;
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  if (!root || !latest) throw new Error('useAccount.ios did not render');
  return {
    unmount: async () => {
      await act(async () => root?.unmount());
      container.remove();
    },
  };
}

const IOS_WALLET = '0x1111111111111111111111111111111111111111';

describe('app-100 final: ios account races', () => {
  it('ignores watch updates after unmount', async () => {
    const harness = await renderIosAccount();
    const listener = mocks.watchListener;
    expect(listener).not.toBeNull();
    await harness.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
    expect(() =>
      listener?.('0x2222222222222222222222222222222222222222'),
    ).not.toThrow();
  });

  it('drops the deferred subject resolution when unmounted first', async () => {
    mocks.privy.user = {
      linked_accounts: [
        {
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: IOS_WALLET,
        },
      ],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: ReturnType<typeof useIosAccount> | undefined;
    act(() => {
      root.render(
        createElement(CaptureIos, {
          onAccount: (value) => {
            latest = value;
          },
        }),
      );
    });
    expect(latest).toBeDefined();
    act(() => {
      root.unmount();
    });
    container.remove();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.getUserByWallet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useInvestExecution: stale failed batch does not clobber the newer progress
// ---------------------------------------------------------------------------

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET = '0xcccccccccccccccccccccccccccccccccccccccc';

const APPROVAL: PreparedTransaction = {
  to: TARGET,
  data: '0x1234',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'approve' },
};

const CALL: PreparedTransaction = {
  to: TARGET,
  data: '0xabcd',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'deposit' },
};

const PLAN: DepositPlan = {
  legs: [],
  approvals: [APPROVAL],
  calls: [CALL],
  totalGasUsd: '0.10',
  sourceChainId: 8453,
};

function investReview(): DepositReviewGroup {
  return {
    status: 'passed',
    warnings: [],
    chainId: 8453,
    walletAddress: WALLET,
    calls: [],
    assetChanges: [],
    approvals: [],
    contracts: [],
    blockNumber: 1,
    callGas: '21000',
    simulationIds: ['sim-1'],
    shareUrls: [],
    simulationFingerprint: `0x${'11'.repeat(32)}`,
    riskHash: `0x${'22'.repeat(32)}`,
    groupId: 'chain-8453',
    groupFingerprint: `0x${'33'.repeat(32)}`,
    batchFingerprint: `0x${'44'.repeat(32)}`,
    reviewedAt: 1_800_000_000_000,
    expiresAt: 1_800_000_300_000,
    expectedSimulationFingerprint: `0x${'11'.repeat(32)}`,
    expectedRiskHash: `0x${'22'.repeat(32)}`,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
  } as DepositReviewGroup;
}

function stageDraft(): StageDraft {
  return {
    positionId: 'morpho-base',
    weightBps: 10_000,
    usd6: '1000000',
    sourceToken: BASE_DEPOSIT_TOKENS[0]!,
    fromAmount: '1000000',
  };
}

function InvestProbe({
  onValue,
}: {
  onValue: (value: InvestExecutionContextValue) => void;
}) {
  onValue(useInvestExecution());
  return null;
}

async function renderInvest() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let value: InvestExecutionContextValue | null = null;
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          InvestExecutionProvider,
          null,
          createElement(InvestProbe, { onValue: (next) => (value = next) }),
        ),
      ),
    );
    await Promise.resolve();
  });
  if (!value) throw new Error('InvestExecutionProvider did not render');
  const get = () => {
    if (!value) throw new Error('InvestExecutionProvider did not render');
    return value;
  };
  return {
    get,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      client.clear();
    },
  };
}

describe('app-100 final: stale execution status', () => {
  it('keeps the newer progress when an older batch reports failure late', async () => {
    let calls = 0;
    mocks.investExecute.mockImplementation(async () => ({
      status: 'submitted',
      callsId: `calls-${(calls += 1)}`,
    }));
    const waiters = new Map<string, (status: unknown) => void>();
    mocks.investWait.mockImplementation(
      ({ callsId }: { callsId: string }) =>
        new Promise((resolve) => {
          waiters.set(callsId, resolve);
        }),
    );

    const harness = renderInvest();
    const first = (await harness).get();
    const submittedA = first.submitReviewedBatch({
      plan: PLAN,
      review: investReview(),
    });
    const submittedB = first.submitReviewedBatch({
      plan: PLAN,
      review: investReview(),
    });
    await act(async () => {
      await submittedA;
      await submittedB;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((await harness).get().reviewedProgress?.callsId).toBe('calls-2');

    await act(async () => {
      waiters.get('calls-1')?.({ status: 'failed', reason: 'boom' });
      await Promise.resolve();
      await Promise.resolve();
    });
    const stale = (await harness).get().reviewedProgress;
    expect(stale?.callsId).toBe('calls-2');
    expect(stale?.phase).not.toBe('failed');

    await act(async () => {
      waiters.get('calls-2')?.({ status: 'confirmed' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((await harness).get().reviewedProgress?.phase).toBe('complete');
    await (await harness).cleanup();
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.privy.isReady = true;
  mocks.privy.user = null;
  mocks.privy.logout.mockResolvedValue(undefined);
  mocks.loginFn.mockResolvedValue(undefined);
  mocks.readWatch.mockImplementation(() => Promise.resolve(null));
  mocks.watchListener = null;
  mocks.unsubscribe.mockImplementation(() => undefined);
  mocks.getUserByWallet.mockImplementation(async () => ({
    user_id: 'watch-user',
  }));
  mocks.getUserProfile.mockImplementation(async (userId: string) => ({
    user: {
      id: userId,
      email: 'reader@example.com',
      is_subscribed_to_reports: false,
      created_at: '2026-09-21T00:00:00Z',
    },
    wallets: [],
  }));

  mocks.invest.stageDrafts = [stageDraft()];
  mocks.invest.hyperCoreFundingDraft = null;
  mocks.execAccount.userId = 'user-1';
  mocks.execAccount.walletAddresses = [WALLET];
  mocks.execWallet.account = { address: WALLET, isConnected: true };
  mocks.execWallet.isConnected = true;
  mocks.execWallet.executionMode = 'eip7702';
  mocks.execWallet.executeReviewedBatch =
    mocks.investExecute as unknown as typeof mocks.execWallet.executeReviewedBatch;
  mocks.execWallet.waitForReviewedBatch =
    mocks.investWait as unknown as typeof mocks.execWallet.waitForReviewedBatch;
  mocks.investExecute.mockResolvedValue({
    status: 'submitted',
    callsId: 'calls-1',
  });
  mocks.investWait.mockResolvedValue({ status: 'confirmed' });
});

afterEach(() => {
  vi.restoreAllMocks();
});
