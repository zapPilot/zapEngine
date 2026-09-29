// @vitest-environment jsdom
import type {
  DepositReviewGroup,
  DepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import type { StageDraft } from '@/integration/investTargetsModel';
import type { HyperCoreFundingDraft } from '@/integration/useInvest';
import {
  InvestExecutionProvider,
  type InvestExecutionContextValue,
  useInvestExecution,
} from '@/integration/useInvestExecution';
import {
  getPrivyEmbeddedEthereumAddress,
  useAccount as useIosAccount,
} from '@/integration/useAccount.ios';

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function stageDraft(fromAmount = '1000000'): StageDraft {
  return {
    positionId: 'morpho-base',
    weightBps: 10_000,
    usd6: fromAmount,
    sourceToken: BASE_DEPOSIT_TOKENS[0],
    fromAmount,
  };
}

function iosProfile(userId: string, wallets: string[]) {
  return {
    user: {
      id: userId,
      email: 'reader@example.com',
      is_subscribed_to_reports: false,
      created_at: '2026-09-21T00:00:00Z',
    },
    wallets: wallets.map((wallet, index) => ({
      id: `wallet-${index + 1}`,
      user_id: userId,
      wallet,
      label: index === 0 ? 'Primary' : null,
      ownership_verified_at: null,
      created_at: '2026-09-21T00:00:00Z',
    })),
  };
}

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
    get account() {
      if (!latest) throw new Error('useAccount.ios did not render');
      return latest;
    },
    rerender: async () => {
      await act(async () => {
        root?.render(
          createElement(CaptureIos, {
            onAccount: (value) => {
              latest = value;
            },
          }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => root?.unmount());
      container.remove();
    },
  };
}

async function flushIos(times = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_WALLET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TARGET = '0xcccccccccccccccccccccccccccccccccccccccc';
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const HASH_C = `0x${'33'.repeat(32)}`;
const HASH_D = `0x${'44'.repeat(32)}`;
const TX_HASH = `0x${'55'.repeat(32)}` as `0x${string}`;

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

function investReview(
  overrides: Partial<DepositReviewGroup> = {},
): DepositReviewGroup {
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
    simulationFingerprint: HASH_A,
    riskHash: HASH_B,
    groupId: 'chain-8453',
    groupFingerprint: HASH_C,
    batchFingerprint: HASH_D,
    reviewedAt: 1_800_000_000_000,
    expiresAt: 1_800_000_300_000,
    expectedSimulationFingerprint: HASH_A,
    expectedRiskHash: HASH_B,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
    ...overrides,
  } as DepositReviewGroup;
}

function strategyPlan(): Record<string, unknown> {
  return {
    kind: 'strategy',
    strategyId: 'strategy-deposit',
    totalUsd6: '2000000',
    totalGasUsd: '0.20',
    executionGroups: [
      {
        id: 'base-morpho',
        chainId: 8453,
        fromToken: WALLET,
        fromAmount: '1000000',
        approvals: [APPROVAL],
        calls: [CALL],
        allocationIds: ['morpho-base-usdc'],
        gasUsd: '0.10',
      },
      {
        id: 'arbitrum-gmx',
        chainId: 42161,
        fromToken: WALLET,
        fromAmount: '1000000',
        approvals: [],
        calls: [{ ...CALL, data: '0xbeef', chainId: 42161 }],
        allocationIds: ['gmx-btc-usdc'],
        gasUsd: '0.10',
      },
    ],
  };
}

interface InvestHarness {
  root: Root;
  container: HTMLDivElement;
  client: QueryClient;
  rerender(): Promise<void>;
  current(): InvestExecutionContextValue;
}

let activeInvest: InvestHarness | null = null;

function InvestProbe({
  onValue,
}: {
  onValue: (value: InvestExecutionContextValue) => void;
}) {
  onValue(useInvestExecution());
  return null;
}

async function renderInvest(): Promise<InvestHarness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let value: InvestExecutionContextValue | null = null;
  const render = async () => {
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
  };
  await render();
  const harness: InvestHarness = {
    root,
    container,
    client,
    rerender: render,
    current: () => {
      if (!value) throw new Error('InvestExecutionProvider did not render');
      return value;
    },
  };
  activeInvest = harness;
  return harness;
}

async function settleInvest(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.privy.isReady = true;
  mocks.privy.user = null;
  mocks.privy.logout.mockResolvedValue(undefined);
  mocks.loginFn.mockResolvedValue(undefined);
  mocks.readWatch.mockImplementation(() => Promise.resolve(null));
  mocks.watchListener = null;
  mocks.unsubscribe.mockImplementation(() => undefined);
  mocks.getUserByWallet.mockImplementation(async (address: string) => ({
    user_id:
      address.toLowerCase() === '0x1111111111111111111111111111111111111111'
        ? 'privy-user'
        : 'watch-user',
  }));
  mocks.getUserProfile.mockImplementation(async (userId: string) =>
    iosProfile(
      userId,
      userId === 'privy-user'
        ? ['0x1111111111111111111111111111111111111111']
        : ['0x2222222222222222222222222222222222222222'],
    ),
  );

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

afterEach(async () => {
  if (activeInvest) {
    const harness = activeInvest;
    activeInvest = null;
    await act(async () => {
      harness.root.unmount();
    });
    harness.container.remove();
    harness.client.clear();
  }
});

// ---------------------------------------------------------------------------
// useAccount.ios pure lookup gaps (lines 36, branches 26,27,29,30,39)
// ---------------------------------------------------------------------------

describe('app-100 account gaps: embedded address lookup', () => {
  it('returns null for null, undefined, and empty input', () => {
    expect(getPrivyEmbeddedEthereumAddress(null)).toBeNull();
    expect(getPrivyEmbeddedEthereumAddress(undefined)).toBeNull();
    expect(getPrivyEmbeddedEthereumAddress([])).toBeNull();
  });

  it('skips non-record entries', () => {
    expect(
      getPrivyEmbeddedEthereumAddress([null, 'wallet', 42, undefined]),
    ).toBeNull();
  });

  it('skips wallets that are not embedded ethereum wallets', () => {
    expect(
      getPrivyEmbeddedEthereumAddress([
        { type: 'email', address: 'reader@example.com' },
        {
          type: 'wallet',
          connector_type: 'injected',
          chain_type: 'ethereum',
          address: WALLET,
        },
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'solana',
          address: WALLET,
        },
        {
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: 123,
        },
      ]),
    ).toBeNull();
  });

  it('skips blank addresses and lowercases the first valid one', () => {
    expect(
      getPrivyEmbeddedEthereumAddress([
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '   ',
        },
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '0xABCDEF0000000000000000000000000000000001  ',
        },
      ]),
    ).toBe('0xabcdef0000000000000000000000000000000001');
  });

  it('accepts embedded connector without wallet type and trims whitespace', () => {
    expect(
      getPrivyEmbeddedEthereumAddress([
        { type: 'smart-wallet', connector_type: 'other', address: WALLET },
        {
          type: 'other',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: `  ${WALLET.toUpperCase()} `,
        },
      ]),
    ).toBe(WALLET);
  });
});

// ---------------------------------------------------------------------------
// useAccount.ios hook gaps
// ---------------------------------------------------------------------------

describe('app-100 account gaps: ios hook behavior', () => {
  it('returns connected immediately when the embedded wallet is already linked', async () => {
    mocks.privy.user = {
      linked_accounts: [
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '0x1111111111111111111111111111111111111111',
        },
      ],
    };
    const rendered = await renderIosAccount();
    await flushIos();
    expect(rendered.account.address).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    await act(async () => {
      await expect(rendered.account.connect()).resolves.toBe('connected');
    });
    expect(mocks.loginFn).not.toHaveBeenCalled();
    expect(rendered.account.isConnected).toBe(true);
    await rendered.unmount();
  });

  it('connects through Privy login and clears the connecting flag', async () => {
    mocks.privy.user = { linked_accounts: [] };
    const rendered = await renderIosAccount();
    await act(async () => {
      await expect(rendered.account.connect()).resolves.toBe('connected');
    });
    expect(mocks.loginFn).toHaveBeenCalledTimes(1);
    expect(rendered.account.connectionError).toBeNull();
    expect(rendered.account.isConnecting).toBe(false);
    await rendered.unmount();
  });

  it('resolves cancelled when Privy login UI is dismissed', async () => {
    mocks.privy.user = { linked_accounts: [] };
    mocks.loginFn.mockRejectedValueOnce(
      Object.assign(new Error('closed'), { code: 'ui_flow_closed' }),
    );
    const rendered = await renderIosAccount();
    await act(async () => {
      await expect(rendered.account.connect()).resolves.toBe('cancelled');
    });
    expect(rendered.account.connectionError).toBeNull();
    expect(rendered.account.isConnecting).toBe(false);
    await rendered.unmount();
  });

  it('records Error failures from Privy login and rethrows', async () => {
    mocks.privy.user = { linked_accounts: [] };
    const failure = new Error('privy exploded');
    mocks.loginFn.mockRejectedValueOnce(failure);
    const rendered = await renderIosAccount();
    await act(async () => {
      await expect(rendered.account.connect()).rejects.toBe(failure);
    });
    expect(rendered.account.connectionError).toBe('privy exploded');
    expect(rendered.account.isConnecting).toBe(false);
    await rendered.unmount();
  });

  it('records non-Error login rejections as strings', async () => {
    mocks.privy.user = { linked_accounts: [] };
    mocks.loginFn.mockRejectedValueOnce('plain-string-failure');
    const rendered = await renderIosAccount();
    await act(async () => {
      await expect(rendered.account.connect()).rejects.toBe(
        'plain-string-failure',
      );
    });
    expect(rendered.account.connectionError).toBe('plain-string-failure');
    await rendered.unmount();
  });

  it('surfaces user-resolution failures and retries successfully', async () => {
    mocks.privy.user = { linked_accounts: [] };
    mocks.readWatch.mockImplementation(() =>
      Promise.resolve('0x2222222222222222222222222222222222222222'),
    );
    mocks.getUserByWallet.mockRejectedValueOnce(new Error('ledger down'));
    const rendered = await renderIosAccount();
    await flushIos();
    expect(rendered.account.userResolutionError).toBe('ledger down');
    expect(rendered.account.isUserResolutionFailed).toBe(true);
    expect(rendered.account.isDemo).toBe(false);

    mocks.getUserByWallet.mockImplementation(async () => ({
      user_id: 'watch-user',
    }));
    await act(async () => {
      await rendered.account.retryUserResolution();
    });
    await flushIos();
    expect(rendered.account.userResolutionError).toBeNull();
    expect(rendered.account.viewingUserId).toBe('watch-user');
    await rendered.unmount();
  });

  it('stringifies non-Error user-resolution failures', async () => {
    mocks.privy.user = { linked_accounts: [] };
    mocks.readWatch.mockImplementation(() =>
      Promise.resolve('0x2222222222222222222222222222222222222222'),
    );
    mocks.getUserByWallet.mockRejectedValueOnce('backend offline');
    const rendered = await renderIosAccount();
    await flushIos();
    expect(rendered.account.userResolutionError).toBe('backend offline');
    await rendered.unmount();
  });

  it('ignores a stale success when the subject changes mid-resolution', async () => {
    mocks.privy.user = { linked_accounts: [] };
    let releaseFirst!: (value: { user_id: string }) => void;
    const firstGate = new Promise<{ user_id: string }>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.getUserByWallet.mockImplementation(async (address: string) => {
      if (address === '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {
        return firstGate;
      }
      return { user_id: 'watch-user' };
    });
    mocks.readWatch.mockImplementation(() =>
      Promise.resolve('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    const rendered = await renderIosAccount();
    await act(async () => {
      await Promise.resolve();
    });
    // Switch subject while the first lookup is still pending.
    mocks.readWatch.mockImplementation(() =>
      Promise.resolve('0x2222222222222222222222222222222222222222'),
    );
    await act(async () => {
      mocks.watchListener?.('0x2222222222222222222222222222222222222222');
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      releaseFirst({ user_id: 'stale-user' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushIos(6);
    expect(rendered.account.viewingUserId).toBe('watch-user');
    expect(rendered.account.userResolutionError).toBeNull();
    await rendered.unmount();
  });

  it('ignores a stale failure when the subject changes mid-resolution', async () => {
    mocks.privy.user = { linked_accounts: [] };
    let rejectFirst!: (error: unknown) => void;
    const firstGate = new Promise<{ user_id: string }>((_, reject) => {
      rejectFirst = reject;
    });
    mocks.getUserByWallet.mockImplementation(async (address: string) => {
      if (address === '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {
        return firstGate;
      }
      return { user_id: 'watch-user' };
    });
    mocks.readWatch.mockImplementation(() =>
      Promise.resolve('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    const rendered = await renderIosAccount();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      mocks.watchListener?.('0x2222222222222222222222222222222222222222');
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      rejectFirst(new Error('stale boom'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushIos(6);
    expect(rendered.account.viewingUserId).toBe('watch-user');
    expect(rendered.account.userResolutionError).toBeNull();
    await rendered.unmount();
  });

  it('disconnects through Privy logout', async () => {
    const rendered = await renderIosAccount();
    await act(async () => {
      await rendered.account.disconnect();
    });
    expect(mocks.privy.logout).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it('unsubscribes the watch listener on unmount and tolerates late storage', async () => {
    let releaseRead!: (value: string | null) => void;
    const readGate = new Promise<string | null>((resolve) => {
      releaseRead = resolve;
    });
    mocks.readWatch.mockImplementation(() => readGate);
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(CaptureIos, {
          onAccount: () => undefined,
        }),
      );
      await Promise.resolve();
    });
    expect(mocks.watchListener).not.toBeNull();
    await act(async () => {
      root?.unmount();
    });
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.watchListener).toBeNull();
    await act(async () => {
      releaseRead('0x2222222222222222222222222222222222222222');
      await Promise.resolve();
      await Promise.resolve();
    });
    container.remove();
  });

  it('reports connecting while Privy is not ready and demo when empty', async () => {
    mocks.privy.isReady = false;
    mocks.privy.user = null;
    const rendered = await renderIosAccount();
    expect(rendered.account.isConnecting).toBe(true);
    expect(rendered.account.address).toBeNull();
    expect(rendered.account.isDemo).toBe(true);
    expect(rendered.account.walletAddresses).toEqual([]);
    expect(rendered.account.walletEntries).toEqual([]);
    expect(rendered.account.email).toBeNull();
    await rendered.unmount();
  });

  it('keeps connecting false when Privy is not ready but a user exists', async () => {
    mocks.privy.isReady = false;
    mocks.privy.user = {
      linked_accounts: [
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '0x1111111111111111111111111111111111111111',
        },
      ],
    };
    const rendered = await renderIosAccount();
    await flushIos();
    expect(rendered.account.isConnecting).toBe(false);
    expect(rendered.account.isResolvingViewingUser).toBe(
      Boolean(rendered.account.address) && rendered.account.loadingUser,
    );
    await rendered.unmount();
  });

  it('maps a wallet without a label to a null entry label', async () => {
    mocks.privy.user = {
      linked_accounts: [
        {
          type: 'wallet',
          connector_type: 'embedded',
          chain_type: 'ethereum',
          address: '0x1111111111111111111111111111111111111111',
        },
      ],
    };
    // The ios hook resolves twice on mount (immediate privy subject, then
    // again after the watch-storage hydration flips `watchHydrated`), so the
    // override must hold for every profile fetch, not just the first.
    mocks.getUserProfile.mockImplementation(async () => ({
      user: {
        id: 'privy-user',
        email: 'reader@example.com',
        is_subscribed_to_reports: false,
        created_at: '2026-09-21T00:00:00Z',
      },
      wallets: [
        {
          id: 'wallet-1',
          user_id: 'privy-user',
          wallet: '0x1111111111111111111111111111111111111111',
          ownership_verified_at: null,
          created_at: '2026-09-21T00:00:00Z',
        },
      ],
    }));
    const rendered = await renderIosAccount();
    await flushIos();
    expect(rendered.account.walletEntries).toEqual([
      {
        address: '0x1111111111111111111111111111111111111111',
        label: null,
      },
    ]);
    await rendered.unmount();
  });
});

// ---------------------------------------------------------------------------
// useInvestExecution gaps
// ---------------------------------------------------------------------------

describe('app-100 execution gaps: wallet and plan branches', () => {
  it('blocks when the wallet account is missing', async () => {
    mocks.execWallet.account = null;
    const harness = await renderInvest();
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    expect(result).toEqual({
      status: 'blocked',
      reason:
        'The connected wallet changed. Refresh the review before signing.',
    });
    expect(mocks.investExecute).not.toHaveBeenCalled();
  });

  it('blocks when the connected wallet differs from the review', async () => {
    const harness = await renderInvest();
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview({ walletAddress: OTHER_WALLET }),
      });
    });
    expect(result).toEqual({
      status: 'blocked',
      reason:
        'The connected wallet changed. Refresh the review before signing.',
    });
    expect(mocks.investExecute).not.toHaveBeenCalled();
  });

  it('blocks when the wallet cannot execute a reviewed batch', async () => {
    mocks.execWallet.executeReviewedBatch = undefined;
    const harness = await renderInvest();
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    expect(result).toEqual({
      status: 'blocked',
      reason: 'This wallet cannot execute a reviewed atomic batch.',
    });
    expect(mocks.investExecute).not.toHaveBeenCalled();
  });

  it('carries the wallet transaction hash into the submission', async () => {
    mocks.investExecute.mockResolvedValueOnce({
      status: 'submitted',
      callsId: 'calls-tx',
      transactionHash: TX_HASH,
    });
    const harness = await renderInvest();
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    expect(harness.current().reviewedSubmission).toEqual({
      status: 'submitted',
      groupId: 'chain-8453',
      chainId: 8453,
      callsId: 'calls-tx',
      transactionHash: TX_HASH,
    });
  });

  it('executes the matching strategy execution group', async () => {
    const harness = await renderInvest();
    const plan = strategyPlan() as unknown as DepositPlan;
    const reviewGroup = investReview({ groupId: 'base-morpho' });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan,
        review: reviewGroup,
      });
    });
    await settleInvest();
    expect(mocks.investExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [APPROVAL, CALL],
        chainId: 8453,
      }),
    );
    expect(harness.current().reviewedSubmission).toMatchObject({
      groupId: 'base-morpho',
      chainId: 8453,
    });
  });

  it('blocks a strategy plan whose group is missing', async () => {
    const harness = await renderInvest();
    const plan = strategyPlan() as unknown as DepositPlan;
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan,
        review: investReview({ groupId: 'unknown-group' }),
      });
    });
    expect(result).toEqual({
      status: 'blocked',
      reason: 'The reviewed execution group is missing from the plan.',
    });
    expect(mocks.investExecute).not.toHaveBeenCalled();
  });
});

describe('app-100 execution gaps: progress monitoring', () => {
  it('marks a wallet without calls status as submitted for a single batch', async () => {
    mocks.execWallet.waitForReviewedBatch = undefined;
    const harness = await renderInvest();
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'submitted',
      groupIndex: 0,
      groupCount: 1,
      statusNote:
        'This wallet accepted the batch, but does not expose calls status.',
    });
  });

  it('marks a wallet without calls status as checkpoint when more groups wait', async () => {
    mocks.execWallet.waitForReviewedBatch = undefined;
    const harness = await renderInvest();
    const first = investReview();
    const second = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: PLAN, review: second },
        ],
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'checkpoint',
      groupIndex: 0,
      groupCount: 2,
    });
  });

  it('treats unknown status as submitted with the wallet reason', async () => {
    mocks.investWait.mockResolvedValueOnce({
      status: 'unknown',
      reason: 'indexer lagging',
    });
    const harness = await renderInvest();
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'submitted',
      statusNote: 'indexer lagging',
    });
  });

  it('treats unknown status without a reason as checkpoint with the default note', async () => {
    mocks.investWait.mockResolvedValueOnce({ status: 'unknown' });
    const harness = await renderInvest();
    const first = investReview();
    const second = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: PLAN, review: second },
        ],
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'checkpoint',
      statusNote: 'Batch status is unavailable; it was not resubmitted.',
    });
  });

  it('keeps a confirmed batch without a hash and completes the queue', async () => {
    mocks.investWait.mockResolvedValueOnce({ status: 'confirmed' });
    const harness = await renderInvest();
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    const progress = harness.current().reviewedProgress;
    expect(progress).toMatchObject({ phase: 'complete', groupIndex: 0 });
    expect(progress).not.toHaveProperty('transactionHash');
  });

  it('ignores a stale waiter result after reset clears progress', async () => {
    let releaseWait!: (value: { status: string }) => void;
    const waitGate = new Promise<{ status: string }>((resolve) => {
      releaseWait = resolve;
    });
    mocks.investExecute.mockResolvedValueOnce({
      status: 'submitted',
      callsId: 'calls-stale',
    });
    mocks.investWait.mockImplementationOnce(() => waitGate);
    const harness = await renderInvest();

    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
      await Promise.resolve();
    });
    expect(harness.current().reviewedProgress).toMatchObject({
      callsId: 'calls-stale',
      phase: 'confirming',
    });

    // Reset clears the in-flight progress; the late waiter result must not
    // resurrect it (covers the callsId/groupIndex mismatch guard).
    await act(async () => {
      harness.current().reset();
    });
    expect(harness.current().reviewedProgress).toBeNull();

    await act(async () => {
      releaseWait({ status: 'confirmed' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toBeNull();
    expect(harness.current().reviewedSubmission).toBeNull();
  });
});

describe('app-100 execution gaps: queue advancement', () => {
  it('blocks submitNext when nothing is queued', async () => {
    const harness = await renderInvest();
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitNextReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitNextReviewedBatch();
    });
    expect(result).toEqual({
      status: 'blocked',
      reason: 'No reviewed batch is waiting for confirmation.',
    });
  });

  it('advances with the queued entry when no explicit re-review is given', async () => {
    mocks.investExecute
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-1' })
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-2' });
    mocks.investWait
      .mockResolvedValueOnce({ status: 'confirmed' })
      .mockResolvedValueOnce({ status: 'confirmed' });
    const harness = await renderInvest();
    const first = investReview();
    const secondPlan: DepositPlan = {
      ...PLAN,
      approvals: [],
      calls: [{ ...CALL, data: '0xbeef' }],
    };
    const second = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: secondPlan, review: second },
        ],
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'checkpoint',
    });
    await act(async () => {
      await harness.current().submitNextReviewedBatch();
    });
    await settleInvest();
    expect(mocks.investExecute.mock.calls[1]?.[0]).toMatchObject({
      transactions: [{ ...CALL, data: '0xbeef' }],
    });
    expect(harness.current().reviewedProgress).toMatchObject({
      callsId: 'calls-2',
      groupIndex: 1,
    });
  });

  it('returns the wallet blocked result from submitNext without committing', async () => {
    mocks.investExecute.mockResolvedValueOnce({
      status: 'submitted',
      callsId: 'calls-1',
    });
    mocks.investWait.mockResolvedValueOnce({ status: 'confirmed' });
    const harness = await renderInvest();
    const first = investReview();
    const second = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: PLAN, review: second },
        ],
      });
    });
    await settleInvest();
    expect(harness.current().reviewedProgress).toMatchObject({
      phase: 'checkpoint',
    });
    mocks.investExecute.mockResolvedValueOnce({
      status: 'review-changed',
      reason: 'batch-fingerprint-mismatch',
    });
    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitNextReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitNextReviewedBatch();
    });
    expect(result).toEqual({
      status: 'review-changed',
      reason: 'batch-fingerprint-mismatch',
    });
    expect(harness.current().reviewedProgress?.callsId).toBe('calls-1');
  });

  it('replaces the queued entry when submitNext carries an explicit re-review', async () => {
    mocks.investExecute
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-1' })
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-2' });
    mocks.investWait
      .mockResolvedValueOnce({ status: 'confirmed' })
      .mockResolvedValueOnce({ status: 'confirmed' });
    const harness = await renderInvest();
    const first = investReview();
    const stalePlan: DepositPlan = {
      ...PLAN,
      calls: [{ ...CALL, data: '0x2222' }],
    };
    const stale = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: stalePlan, review: stale },
        ],
      });
    });
    await settleInvest();
    const replacementPlan: DepositPlan = {
      ...PLAN,
      calls: [{ ...CALL, data: '0x3333' }],
    };
    const replacement = investReview({ batchFingerprint: HASH_D });
    await act(async () => {
      await harness.current().submitNextReviewedBatch({
        plan: replacementPlan,
        review: replacement,
      });
    });
    await settleInvest();
    expect(mocks.investExecute.mock.calls[1]?.[0]).toMatchObject({
      transactions: [APPROVAL, { ...CALL, data: '0x3333' }],
      expectedBatchFingerprint: HASH_D,
    });
    expect(harness.current().reviewedQueue[1]).toEqual({
      plan: replacementPlan,
      review: replacement,
    });
    expect(harness.current().reviewedProgress).toMatchObject({
      groupIndex: 1,
      groupCount: 2,
    });
  });

  it('updates a queued entry in place', async () => {
    const harness = await renderInvest();
    mocks.investExecute.mockResolvedValueOnce({
      status: 'submitted',
      callsId: 'calls-1',
    });
    const first = investReview();
    const stale = investReview({ batchFingerprint: HASH_C });
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: first,
        queue: [
          { plan: PLAN, review: first },
          { plan: PLAN, review: stale },
        ],
      });
    });
    await settleInvest();
    const replacementPlan: DepositPlan = {
      ...PLAN,
      calls: [{ ...CALL, data: '0x9999' }],
    };
    const replacement = investReview({ batchFingerprint: HASH_D });
    await act(async () => {
      harness.current().updateReviewedQueueEntry({
        index: 1,
        plan: replacementPlan,
        review: replacement,
      });
    });
    expect(harness.current().reviewedQueue[1]).toEqual({
      plan: replacementPlan,
      review: replacement,
    });
    expect(harness.current().reviewedQueue[0]?.review).toBe(first);
  });

  it('keeps committed state when drafts do not change and resets explicitly', async () => {
    const harness = await renderInvest();
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    expect(harness.current().reviewedSubmission).not.toBeNull();
    await harness.rerender();
    expect(harness.current().reviewedSubmission).not.toBeNull();
    expect(harness.current().capability).toBe('ready');
    await act(async () => {
      harness.current().reset();
    });
    expect(harness.current().reviewedSubmission).toBeNull();
    expect(harness.current().reviewedProgress).toBeNull();
    expect(harness.current().reviewedQueue).toEqual([]);
  });

  it('reports connect-wallet and unsupported-wallet capabilities', async () => {
    mocks.execWallet.isConnected = false;
    const disconnected = await renderInvest();
    expect(disconnected.current().capability).toBe('connect-wallet');
    await act(async () => {
      disconnected.root.unmount();
    });
    disconnected.container.remove();
    disconnected.client.clear();
    activeInvest = null;

    mocks.execWallet.isConnected = true;
    mocks.execWallet.executionMode = undefined;
    const unsupported = await renderInvest();
    expect(unsupported.current().capability).toBe('unsupported-wallet');
  });
});

describe('app-100 execution gaps: completion invalidations', () => {
  it('only refreshes portfolio when identity and wallets are empty', async () => {
    mocks.execAccount.userId = null;
    mocks.execAccount.walletAddresses = [];
    const harness = await renderInvest();
    const invalidateSpy = vi.spyOn(harness.client, 'invalidateQueries');
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    const keys = invalidateSpy.mock.calls.map(
      ([input]) => (input as { queryKey: unknown }).queryKey,
    );
    expect(keys).toContainEqual(['portfolio']);
    expect(keys).not.toContainEqual(['portfolio-dashboard', 'user-1']);
    expect(
      keys.some(
        (key) =>
          Array.isArray(key) && key[0] === 'desktop' && key[1] === 'alchemy',
      ),
    ).toBe(false);
  });

  it('skips wallet assets when the bundle is empty but user exists', async () => {
    mocks.execAccount.userId = 'user-1';
    mocks.execAccount.walletAddresses = [];
    const harness = await renderInvest();
    const invalidateSpy = vi.spyOn(harness.client, 'invalidateQueries');
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    const keys = invalidateSpy.mock.calls.map(
      ([input]) => (input as { queryKey: unknown }).queryKey,
    );
    expect(keys).toContainEqual(['portfolio-dashboard', 'user-1']);
    expect(
      keys.some(
        (key) =>
          Array.isArray(key) && key[0] === 'desktop' && key[1] === 'alchemy',
      ),
    ).toBe(false);
  });

  it('skips user queries when only wallet addresses exist', async () => {
    mocks.execAccount.userId = null;
    mocks.execAccount.walletAddresses = [WALLET];
    mocks.execWallet.account = { address: WALLET, isConnected: true };
    const harness = await renderInvest();
    const invalidateSpy = vi.spyOn(harness.client, 'invalidateQueries');
    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: investReview(),
      });
    });
    await settleInvest();
    const keys = invalidateSpy.mock.calls.map(
      ([input]) => (input as { queryKey: unknown }).queryKey,
    );
    expect(keys).toContainEqual(['portfolio']);
    expect(keys).toContainEqual([
      'desktop',
      'alchemy',
      'wallet-assets',
      [WALLET],
    ]);
    expect(
      keys.some(
        (key) => Array.isArray(key) && key[0] === 'portfolio-dashboard',
      ),
    ).toBe(false);
  });

  it('throws outside the provider', () => {
    function Outside() {
      useInvestExecution();
      return null;
    }
    expect(() => renderToString(createElement(Outside))).toThrow(
      'useInvestExecution must be used within an InvestExecutionProvider',
    );
  });
});
