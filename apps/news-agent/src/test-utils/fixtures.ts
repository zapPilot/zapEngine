import type {
  DepositPlan,
  PlanOrchestrationDepositReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';

import { AMOUNT, USDC, VAULT } from '../services/demoRule.js';
import { fingerprint } from '../services/guard.js';

export const wallet: `0x${string}` =
  '0x1111111111111111111111111111111111111111';
export const now = Date.parse('2026-09-26T00:00:00Z');
export const hash: `0x${string}` = `0x${'ab'.repeat(32)}`;
export const depositAbi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);
export function deposit(
  amount = AMOUNT,
  receiver: `0x${string}` = wallet,
): PreparedTransaction {
  return {
    chainId: 8453,
    to: VAULT,
    data: encodeFunctionData({
      abi: depositAbi,
      functionName: 'deposit',
      args: [amount, receiver],
    }),
    value: '0',
    meta: { intentType: 'deposit' },
  };
}
export function approvedReview(
  approve = false,
): PlanOrchestrationDepositReviewResponse & { plan: DepositPlan } {
  const calls = [deposit()];
  const approvals = approve
    ? [
        {
          ...calls[0]!,
          to: USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [VAULT, AMOUNT],
          }),
        },
      ]
    : [];
  return {
    plan: {
      approvals,
      calls,
      legs: [],
      totalGasUsd: '0.01',
      sourceChainId: 8453,
    },
    planFingerprint: hash,
    reviewedAt: now,
    expiresAt: now + 300_000,
    reviews: {
      'chain-8453': {
        status: 'passed',
        groupId: 'chain-8453',
        groupFingerprint: hash,
        batchFingerprint: fingerprint(8453, [...approvals, ...calls]),
        reviewedAt: now,
        expiresAt: now + 300_000,
        expectedSimulationFingerprint: hash,
        expectedRiskHash: hash,
        blocked: false,
        executionAllowed: true,
        requiresRiskAcknowledgement: false,
        chainId: 8453,
        walletAddress: wallet,
        calls: [],
        assetChanges: [],
        approvals: [],
        contracts: [],
        warnings: [],
        blockNumber: 1,
        callGas: '100000',
        simulationIds: ['simulation'],
        shareUrls: [],
        simulationFingerprint: hash,
        riskHash: hash,
      },
    },
  };
}
