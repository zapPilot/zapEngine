// @vitest-environment jsdom

import type {
  DepositReviewGroup,
  PlanOrchestrationDepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvestExecutionProvider,
  type InvestExecutionContextValue,
  useInvestExecution,
} from '@/integration/useInvestExecution';

const mocks = vi.hoisted(() => ({
  buildInvestDepositPlanRequest: vi.fn(),
  executeReviewedBatch: vi.fn(),
  waitForReviewedBatch: vi.fn(),
  trackEvent: vi.fn(),
  resetStrategy: vi.fn(),
  resetSingleChain: vi.fn(),
  startStrategy: vi.fn(),
  startSingleChain: vi.fn(),
  advanceStrategy: vi.fn(),
  advanceSingleChain: vi.fn(),
  retryStrategy: vi.fn(),
  retrySingleChain: vi.fn(),
  invest: {
    scope: 'base',
    destination: 'morpho',
    totalUsd6: '1000000',
    baseFundingToken: {
      depositAddress: '0x1111111111111111111111111111111111111111',
    },
    arbitrumFundingToken: {
      depositAddress: '0x2222222222222222222222222222222222222222',
    },
    singleChainFundingDraft: null as null | {
      scope: string;
      chainId: number;
      fromToken: string;
      fromAmount: string;
    },
  },
  wallet: {
    account: {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      isConnected: true,
    } as { address: string; isConnected: boolean } | null,
    isConnected: true,
    executionMode: 'eip7702' as 'atomic-batch' | 'eip7702' | undefined,
    executeReviewedBatch: vi.fn(),
    waitForReviewedBatch: vi.fn(),
  },
  strategyWizard: {
    steps: [],
    currentIndex: 0,
    status: 'idle',
    error: null,
  },
  singleChainWizard: {
    steps: [],
    currentIndex: 0,
    status: 'idle',
    error: null,
    recovery: null,
  },
}));

vi.mock('@zapengine/app-core/hooks/queries', () => ({
  queryKeys: { desktop: { all: ['desktop'] } },
}));

vi.mock('@zapengine/app-core/hooks/useStrategyDepositWizard', () => ({
  useStrategyDepositWizard: () => ({
    wizard: mocks.strategyWizard,
    pending: false,
    start: mocks.startStrategy,
    advance: mocks.advanceStrategy,
    retry: mocks.retryStrategy,
    reset: mocks.resetStrategy,
  }),
}));

vi.mock('@zapengine/app-core/hooks/useSingleChainDepositWizard', () => ({
  useSingleChainDepositWizard: () => ({
    wizard: mocks.singleChainWizard,
    pending: false,
    start: mocks.startSingleChain,
    advance: mocks.advanceSingleChain,
    retry: mocks.retrySingleChain,
    reset: mocks.resetSingleChain,
  }),
}));

vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.wallet,
}));

vi.mock('@/integration/useInvest', () => ({
  buildInvestDepositPlanRequest: mocks.buildInvestDepositPlanRequest,
  useInvest: () => mocks.invest,
}));

vi.mock('@/observability/analytics', () => ({
  trackEvent: mocks.trackEvent,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_WALLET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TARGET = '0xcccccccccccccccccccccccccccccccccccccccc';
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const HASH_C = `0x${'33'.repeat(32)}`;
const HASH_D = `0x${'44'.repeat(32)}`;

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

const PLAN: PlanOrchestrationDepositPlan = {
  legs: [],
  approvals: [APPROVAL],
  calls: [CALL],
  totalGasUsd: '0.10',
  sourceChainId: 8453,
};

function review(
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

interface Harness {
  root: Root;
  container: HTMLDivElement;
  client: QueryClient;
  rerender(): Promise<void>;
  current(): InvestExecutionContextValue;
}

let activeHarness: Harness | null = null;

function Probe({ onValue }: { onValue: (value: InvestExecutionContextValue) => void }) {
  onValue(useInvestExecution());
  return null;
}

async function renderHarness(): Promise<Harness> {
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
            createElement(Probe, { onValue: (next) => (value = next) }),
          ),
        ),
      );
      await Promise.resolve();
    });
  };

  await render();
  const harness: Harness = {
    root,
    container,
    client,
    rerender: render,
    current: () => {
      if (!value) throw new Error('InvestExecutionProvider did not render');
      return value;
    },
  };
  activeHarness = harness;
  return harness;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invest.scope = 'base';
  mocks.invest.destination = 'morpho';
  mocks.invest.totalUsd6 = '1000000';
  mocks.invest.singleChainFundingDraft = null;
  mocks.wallet.account = { address: WALLET, isConnected: true };
  mocks.wallet.isConnected = true;
  mocks.wallet.executionMode = 'eip7702';
  mocks.wallet.executeReviewedBatch = mocks.executeReviewedBatch;
  mocks.wallet.waitForReviewedBatch = mocks.waitForReviewedBatch;
  mocks.strategyWizard.status = 'idle';
  mocks.singleChainWizard.status = 'idle';
  mocks.executeReviewedBatch.mockResolvedValue({
    status: 'submitted',
    callsId: 'calls-1',
  });
  mocks.waitForReviewedBatch.mockResolvedValue({ status: 'confirmed' });
  mocks.buildInvestDepositPlanRequest.mockReturnValue(null);
});

afterEach(async () => {
  if (!activeHarness) return;
  await act(async () => {
    activeHarness?.root.unmount();
  });
  activeHarness.container.remove();
  activeHarness.client.clear();
  activeHarness = null;
});

describe('InvestExecutionProvider reviewed execution contract', () => {
  it('blocks when the reviewed group no longer exists in the plan', async () => {
    const harness = await renderHarness();

    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: review({ groupId: 'chain-42161' }),
      });
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'The reviewed execution group is missing from the plan.',
    });
    expect(mocks.executeReviewedBatch).not.toHaveBeenCalled();
  });

  it('blocks a wallet switch before asking the wallet to sign', async () => {
    const harness = await renderHarness();

    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: review({ walletAddress: OTHER_WALLET }),
      });
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'The connected wallet changed. Refresh the review before signing.',
    });
    expect(mocks.executeReviewedBatch).not.toHaveBeenCalled();
  });

  it('returns the wallet review-changed result without committing stale progress', async () => {
    mocks.executeReviewedBatch.mockResolvedValueOnce({
      status: 'review-changed',
      reason: 'batch-fingerprint-mismatch',
    });
    const harness = await renderHarness();

    let result: Awaited<
      ReturnType<InvestExecutionContextValue['submitReviewedBatch']>
    > | null = null;
    await act(async () => {
      result = await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: review(),
      });
    });

    expect(result).toEqual({
      status: 'review-changed',
      reason: 'batch-fingerprint-mismatch',
    });
    expect(harness.current().reviewedSubmission).toBeNull();
    expect(harness.current().reviewedProgress).toBeNull();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('submits exactly the reviewed transactions and carries review fingerprints to the wallet', async () => {
    const harness = await renderHarness();
    const serverReview = review({ requiresRiskAcknowledgement: true });

    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: serverReview,
        acknowledgedRiskHash: HASH_B,
      });
    });
    await settle();

    expect(mocks.executeReviewedBatch).toHaveBeenCalledWith({
      transactions: [APPROVAL, CALL],
      chainId: 8453,
      expectedWalletAddress: WALLET,
      expectedBatchFingerprint: HASH_D,
      expiresAt: serverReview.expiresAt,
      executionAllowed: true,
      expectedSimulationFingerprint: HASH_A,
      expectedRiskHash: HASH_B,
      requiresRiskAcknowledgement: true,
      acknowledgedRiskHash: HASH_B,
    });
    expect(mocks.trackEvent).toHaveBeenCalledWith('invest_submitted', {
      chain_id: 8453,
      group_id: 'chain-8453',
    });
    expect(harness.current().reviewedSubmission).toEqual({
      status: 'submitted',
      groupId: 'chain-8453',
      chainId: 8453,
      callsId: 'calls-1',
    });
    expect(harness.current().reviewedProgress).toMatchObject({
      callsId: 'calls-1',
      phase: 'complete',
      groupIndex: 0,
      groupCount: 1,
    });
    expect(mocks.waitForReviewedBatch).toHaveBeenCalledWith({
      callsId: 'calls-1',
      chainId: 8453,
    });
  });

  it('advances a reviewed queue one batch at a time without resubmitting the first group', async () => {
    const firstReview = review();
    const secondPlan: PlanOrchestrationDepositPlan = {
      ...PLAN,
      approvals: [],
      calls: [{ ...CALL, data: '0xbeef' }],
    };
    const secondReview = review({ batchFingerprint: HASH_C });
    mocks.executeReviewedBatch
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-1' })
      .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-2' });
    mocks.waitForReviewedBatch
      .mockResolvedValueOnce({ status: 'confirmed' })
      .mockResolvedValueOnce({
        status: 'confirmed',
        transactionHash: `0x${'55'.repeat(32)}`,
      });
    const harness = await renderHarness();

    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: firstReview,
        queue: [
          { plan: PLAN, review: firstReview },
          { plan: secondPlan, review: secondReview },
        ],
      });
    });
    await settle();
    expect(harness.current().reviewedProgress).toMatchObject({
      callsId: 'calls-1',
      phase: 'checkpoint',
      groupIndex: 0,
      groupCount: 2,
    });

    await act(async () => {
      await harness.current().submitNextReviewedBatch();
    });
    await settle();

    expect(mocks.executeReviewedBatch).toHaveBeenCalledTimes(2);
    expect(mocks.executeReviewedBatch.mock.calls[1]?.[0]).toMatchObject({
      transactions: [{ ...CALL, data: '0xbeef' }],
      expectedBatchFingerprint: HASH_C,
    });
    expect(harness.current().reviewedProgress).toMatchObject({
      callsId: 'calls-2',
      phase: 'complete',
      groupIndex: 1,
      groupCount: 2,
      transactionHash: `0x${'55'.repeat(32)}`,
    });
  });

  it('clears a committed review when the execution draft changes', async () => {
    const harness = await renderHarness();

    await act(async () => {
      await harness.current().submitReviewedBatch({
        plan: PLAN,
        review: review(),
      });
    });
    await settle();
    expect(harness.current().reviewedSubmission).not.toBeNull();

    mocks.invest.totalUsd6 = '2000000';
    await harness.rerender();

    expect(harness.current().reviewedSubmission).toBeNull();
    expect(harness.current().reviewedProgress).toBeNull();
    expect(harness.current().reviewedQueue).toEqual([]);
    expect(mocks.resetStrategy).toHaveBeenCalledTimes(1);
    expect(mocks.resetSingleChain).toHaveBeenCalledTimes(1);
  });
});
