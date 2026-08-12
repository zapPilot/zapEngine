import {
  ExecutionSimulationReviewSchema,
  PlanOrchestrationDepositReviewRequestSchema,
  PlanOrchestrationDepositReviewResponseSchema,
} from '../../../src/api/execution-review';
import { BASE_USDC_ADDRESS } from '../../../src/api/deposit';
import { describe, expect, it } from 'vitest';

const WALLET = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const HASH = `0x${'1'.repeat(64)}`;

const passedEvidence = {
  status: 'passed' as const,
  chainId: 8453,
  walletAddress: WALLET,
  calls: [
    {
      index: 0,
      to: TARGET,
      data: '0x',
      value: '0',
      method: null,
      status: 'succeeded' as const,
      gasUsed: '21000',
      error: null,
    },
  ],
  assetChanges: [],
  approvals: [],
  contracts: [{ address: TARGET, name: 'Target', callIndexes: [0] }],
  warnings: [],
  blockNumber: 123,
  callGas: '21000',
  simulationIds: ['sim-1'],
  shareUrls: [],
  simulationFingerprint: HASH,
  riskHash: HASH,
};

describe('wallet-neutral execution review schemas', () => {
  it('accepts simulation evidence independently of Privy signing fields', () => {
    expect(ExecutionSimulationReviewSchema.parse(passedEvidence)).toEqual(
      passedEvidence,
    );
  });

  it('accepts the deposit request contract unchanged for review', () => {
    const parsed = PlanOrchestrationDepositReviewRequestSchema.parse({
      kind: 'invest',
      userAddress: WALLET,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000',
      sourceChainId: 8453,
    });
    expect(parsed.kind).toBe('invest');
  });

  it('requires review freshness, fingerprints, and execution gating metadata', () => {
    const response = PlanOrchestrationDepositReviewResponseSchema.parse({
      plan: {
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
        sourceChainId: 8453,
      },
      planFingerprint: HASH,
      reviewedAt: 1_000,
      expiresAt: 301_000,
      reviews: {
        'chain-8453': {
          ...passedEvidence,
          groupId: 'chain-8453',
          groupFingerprint: HASH,
          batchFingerprint: HASH,
          reviewedAt: 1_000,
          expiresAt: 301_000,
          expectedSimulationFingerprint: HASH,
          expectedRiskHash: HASH,
          blocked: false,
          executionAllowed: true,
          requiresRiskAcknowledgement: false,
        },
      },
    });
    expect(response.reviews['chain-8453']?.executionAllowed).toBe(true);
  });
});
