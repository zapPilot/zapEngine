import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import type { ReviewedBatch } from '@/integration/useInvestReview';
const hash = `0x${'1'.repeat(64)}`;
const token = BASE_DEPOSIT_TOKENS[0];
export const reviewedInvestFixture: ReviewedBatch = {
  draft: {
    chainId: 8453,
    positions: [
      {
        positionId: 'morpho-base',
        weightBps: 3600,
        usd6: '36000000',
        fromAmount: '36000000',
        sourceToken: token,
      },
    ],
  },
  plan: {
    sourceChainId: 8453,
    legs: [
      {
        chainId: 8453,
        kind: 'supply',
        protocol: 'morpho',
        toToken: token.depositAddress,
        fromAmount: '36000000',
        toAmountMin: '36000000',
        gasUsd: '0.01',
        durationSec: 1,
      },
    ],
    approvals: [],
    calls: [
      {
        to: token.depositAddress,
        data: '0xabcd',
        value: '0',
        chainId: 8453,
        meta: { intentType: 'SUPPLY' },
      },
    ],
    totalGasUsd: '0.01',
  },
  review: {
    status: 'passed',
    warnings: [],
    chainId: 8453,
    walletAddress: '0x1111111111111111111111111111111111111111',
    calls: [],
    assetChanges: [],
    approvals: [],
    contracts: [],
    blockNumber: 1,
    callGas: '21000',
    simulationIds: ['fixture'],
    shareUrls: [],
    simulationFingerprint: hash,
    riskHash: hash,
    groupId: 'chain-8453',
    groupFingerprint: hash,
    batchFingerprint: hash,
    reviewedAt: 1800000000000,
    expiresAt: 1800000300000,
    expectedSimulationFingerprint: hash,
    expectedRiskHash: hash,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
  },
};
