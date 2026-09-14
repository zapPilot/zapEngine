import type {
  DepositPlan,
  DepositReviewGroup,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

import {
  advanceCheckpoint,
  CHECKPOINT_BLOCKED_REASON,
  CHECKPOINT_REVIEW_CHANGED_REASON,
  type CheckpointReviewedBatch,
} from '@/integration/checkpointAdvanceModel';

const WALLET = '0x1111111111111111111111111111111111111111';
const HASH_A = `0x${'11'.repeat(32)}`;
const HASH_B = `0x${'22'.repeat(32)}`;
const NOW = 1_800_000_000_000;

function group(
  overrides: Partial<DepositReviewGroup> = {},
): DepositReviewGroup {
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
    simulationFingerprint: HASH_A,
    riskHash: HASH_B,
    groupId: 'chain-42161',
    groupFingerprint: HASH_A,
    batchFingerprint: HASH_B,
    reviewedAt: NOW - 1_000,
    expiresAt: NOW + 300_000,
    expectedSimulationFingerprint: HASH_A,
    expectedRiskHash: HASH_B,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
    ...overrides,
  } as DepositReviewGroup;
}

const hlpStep: HyperliquidVaultDepositStep = {
  kind: 'hyperliquid-vault-deposit',
  chainId: 1337,
  afterLegIndex: 0,
  amount: { source: 'bridge-output', legIndex: 0 },
  minDepositUsd: '10000000',
  action: {
    type: 'vaultTransfer',
    vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    isDeposit: true,
  },
  signing: {
    scheme: 'hyperliquid-l1-action',
    hyperliquidChain: 'Mainnet',
    apiUrl: 'https://api.hyperliquid.xyz/exchange',
  },
  lockupDays: 4,
};

function plan(followUps: DepositPlan['followUps'] = undefined): DepositPlan {
  return {
    legs: [],
    approvals: [],
    calls: [],
    ...(followUps ? { followUps } : {}),
    totalGasUsd: '0',
    sourceChainId: 42161,
  };
}

function batch(overrides: Partial<CheckpointReviewedBatch> = {}) {
  return { plan: plan(), review: group(), ...overrides };
}

function ports(
  overrides: Partial<Parameters<typeof advanceCheckpoint>[0]> = {},
) {
  return {
    reviewNext: vi.fn(async () => batch()),
    queued: batch(),
    now: () => NOW,
    captureHlpBaseline: vi.fn(async () => undefined),
    submitNext: vi.fn(async () => ({ status: 'submitted' as const })),
    ...overrides,
  };
}

describe('advanceCheckpoint', () => {
  it('submits the re-reviewed batch when every fingerprint still matches', async () => {
    const input = ports();

    await expect(advanceCheckpoint(input)).resolves.toEqual({
      status: 'submitted',
    });
    expect(input.submitNext).toHaveBeenCalledWith({
      plan: plan(),
      review: group(),
    });
    expect(input.captureHlpBaseline).not.toHaveBeenCalled();
  });

  it('snapshots HyperCore before the batch that moves the USDC', async () => {
    const order: string[] = [];
    const input = ports({
      reviewNext: vi.fn(async () => batch({ plan: plan([hlpStep]) })),
      captureHlpBaseline: vi.fn(async (step: HyperliquidVaultDepositStep) => {
        expect(step).toEqual(hlpStep);
        order.push('baseline');
      }),
      submitNext: vi.fn(async () => {
        order.push('submit');
        return { status: 'submitted' as const };
      }),
    });

    await advanceCheckpoint(input);

    // A snapshot taken after the transfer would sweep USDC the user held.
    expect(order).toEqual(['baseline', 'submit']);
  });

  it('stops on changed evidence and hands back the fresh review', async () => {
    const fresh = batch({ review: group({ batchFingerprint: HASH_A }) });
    const input = ports({ reviewNext: vi.fn(async () => fresh) });

    await expect(advanceCheckpoint(input)).resolves.toEqual({
      status: 'review-changed',
      fresh,
      reason: CHECKPOINT_REVIEW_CHANGED_REASON,
    });
    expect(input.submitNext).not.toHaveBeenCalled();
    expect(input.captureHlpBaseline).not.toHaveBeenCalled();
  });

  it('stops on an expired review without touching the wallet', async () => {
    const fresh = batch({ review: group({ expiresAt: NOW - 1 }) });
    const input = ports({ reviewNext: vi.fn(async () => fresh) });

    await expect(advanceCheckpoint(input)).resolves.toEqual({
      status: 'blocked',
      fresh,
      reason: CHECKPOINT_BLOCKED_REASON,
    });
    expect(input.submitNext).not.toHaveBeenCalled();
  });

  it('forwards the acknowledgement a warning review demands', async () => {
    const warned = group({
      status: 'warning',
      requiresRiskAcknowledgement: true,
    });
    const input = ports({
      queued: batch({ review: warned }),
      reviewNext: vi.fn(async () => batch({ review: warned })),
    });

    await advanceCheckpoint(input);

    expect(input.submitNext).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedRiskHash: HASH_B }),
    );
  });

  it('reports a refused submission rather than retrying it', async () => {
    const input = ports({
      submitNext: vi.fn(async () => ({
        status: 'blocked' as const,
        reason: 'The connected wallet changed.',
      })),
    });

    await expect(advanceCheckpoint(input)).resolves.toEqual({
      status: 'rejected',
      reason: 'The connected wallet changed.',
    });
    expect(input.submitNext).toHaveBeenCalledTimes(1);
  });
});
