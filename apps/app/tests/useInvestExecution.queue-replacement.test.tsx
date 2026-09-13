// @vitest-environment jsdom

import type {
  DepositReviewGroup,
  PlanOrchestrationDepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import type { StageDraft } from '@/integration/investTargetsModel';
import {
  InvestExecutionProvider,
  type InvestExecutionContextValue,
  useInvestExecution,
} from '@/integration/useInvestExecution';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET = '0xcccccccccccccccccccccccccccccccccccccccc';
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const HASH_C = `0x${'33'.repeat(32)}`;
const HASH_D = `0x${'44'.repeat(32)}`;
const HASH_E = `0x${'55'.repeat(32)}`;

const mocks = vi.hoisted(() => ({
  executeReviewedBatch: vi.fn(),
  waitForReviewedBatch: vi.fn(),
  trackEvent: vi.fn(),
  invest: { stageDrafts: [] as StageDraft[] },
  wallet: {
    account: { address: WALLET, isConnected: true },
    isConnected: true,
    executionMode: 'eip7702' as const,
    executeReviewedBatch: vi.fn(),
    waitForReviewedBatch: vi.fn(),
  },
}));

vi.mock('@zapengine/app-core/hooks/queries', () => ({
  queryKeys: { desktop: { all: ['desktop'] } },
}));
vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.wallet,
}));
vi.mock('@/integration/useInvest', () => ({ useInvest: () => mocks.invest }));
vi.mock('@/observability/analytics', () => ({ trackEvent: mocks.trackEvent }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function stageDraft(): StageDraft {
  return {
    positionId: 'morpho-base',
    weightBps: 10_000,
    usd6: '1000000',
    sourceToken: BASE_DEPOSIT_TOKENS[0],
    fromAmount: '1000000',
  };
}

function call(data: string): PreparedTransaction {
  return {
    to: TARGET,
    data: data as `0x${string}`,
    value: '0',
    chainId: 8453,
    meta: { intentType: 'deposit' },
  };
}

function plan(data: string): PlanOrchestrationDepositPlan {
  return {
    legs: [],
    approvals: [],
    calls: [call(data)],
    totalGasUsd: '0.10',
    sourceChainId: 8453,
  };
}

function review(batchFingerprint: string): DepositReviewGroup {
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
    batchFingerprint,
    reviewedAt: 1_800_000_000_000,
    expiresAt: 1_800_000_300_000,
    expectedSimulationFingerprint: HASH_A,
    expectedRiskHash: HASH_B,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
  } as DepositReviewGroup;
}

let cleanup: (() => Promise<void>) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invest.stageDrafts = [stageDraft()];
  mocks.wallet.executeReviewedBatch = mocks.executeReviewedBatch;
  mocks.wallet.waitForReviewedBatch = mocks.waitForReviewedBatch;
  mocks.executeReviewedBatch
    .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-1' })
    .mockResolvedValueOnce({ status: 'submitted', callsId: 'calls-2' });
  mocks.waitForReviewedBatch
    .mockResolvedValueOnce({ status: 'confirmed' })
    .mockResolvedValueOnce({ status: 'confirmed' });
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('InvestExecutionProvider reviewed queue replacement', () => {
  it('submits the re-reviewed replacement entry instead of stale queue evidence', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    let current: InvestExecutionContextValue | null = null;
    const Probe = () => {
      current = useInvestExecution();
      return null;
    };
    cleanup = async () => {
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    };

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(InvestExecutionProvider, null, createElement(Probe)),
        ),
      );
    });

    const firstPlan = plan('0x1111');
    const stalePlan = plan('0x2222');
    const replacementPlan = plan('0x3333');
    const firstReview = review(HASH_D);
    const staleReview = review(HASH_C);
    const replacementReview = review(HASH_E);

    await act(async () => {
      await current!.submitReviewedBatch({
        plan: firstPlan,
        review: firstReview,
        queue: [
          { plan: firstPlan, review: firstReview },
          { plan: stalePlan, review: staleReview },
        ],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(current!.reviewedProgress).toMatchObject({
      phase: 'checkpoint',
      groupIndex: 0,
    });

    await act(async () => {
      current!.updateReviewedQueueEntry({
        index: 1,
        plan: replacementPlan,
        review: replacementReview,
      });
    });

    await act(async () => {
      await current!.submitNextReviewedBatch();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.executeReviewedBatch).toHaveBeenCalledTimes(2);
    expect(mocks.executeReviewedBatch.mock.calls[1]?.[0]).toMatchObject({
      transactions: [call('0x3333')],
      expectedBatchFingerprint: HASH_E,
    });
    expect(mocks.executeReviewedBatch.mock.calls[1]?.[0]).not.toMatchObject({
      transactions: [call('0x2222')],
      expectedBatchFingerprint: HASH_C,
    });
  });
});
