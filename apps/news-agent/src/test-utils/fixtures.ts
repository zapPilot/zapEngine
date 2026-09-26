import type {
  PlanOrchestrationRotateReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi, erc4626Abi } from 'viem';

import {
  ETH_VAULT,
  LIFI_DIAMOND,
  SHARES,
  USDC,
  USDC_VAULT,
  WETH,
} from '../services/demoRule.js';
import { fingerprint, lifiSwapAbi } from '../services/guard.js';

export const wallet: `0x${string}` =
  '0x1111111111111111111111111111111111111111';
export const now = Date.parse('2026-09-26T00:00:00Z');
export const hash: `0x${string}` = `0x${'ab'.repeat(32)}`;
/** previewRedeem(SHARES) and the swap's guaranteed USDC, as in a live quote. */
export const SWAP_FROM = 101_836_563_160_665n;
export const MIN_OUT = 270_998n;

const tx = (
  to: string,
  data: `0x${string}`,
  intentType: string,
  gasLimit?: string,
): PreparedTransaction => ({
  chainId: 8453,
  to,
  data,
  value: '0',
  ...(gasLimit ? { gasLimit } : {}),
  meta: { intentType },
});

export function approve(token: string, spender: string, amount: bigint) {
  return tx(
    token,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender as `0x${string}`, amount],
    }),
    'APPROVAL',
  );
}

export function redeem(
  shares = SHARES,
  receiver: `0x${string}` = wallet,
  owner: `0x${string}` = wallet,
) {
  return tx(
    ETH_VAULT,
    encodeFunctionData({
      abi: erc4626Abi,
      functionName: 'redeem',
      args: [shares, receiver, owner],
    }),
    'WITHDRAW',
  );
}

export function swap(
  overrides: {
    receiver?: `0x${string}`;
    minOut?: bigint;
    receivingAssetId?: `0x${string}`;
    to?: string;
  } = {},
) {
  const leg = (
    sendingAssetId: `0x${string}`,
    receivingAssetId: `0x${string}`,
    fromAmount: bigint,
  ) => ({
    callTo: '0x2222222222222222222222222222222222222222' as const,
    approveTo: '0x2222222222222222222222222222222222222222' as const,
    sendingAssetId,
    receivingAssetId,
    fromAmount,
    callData: '0x' as const,
    requiresDeposit: false,
  });
  return tx(
    overrides.to ?? LIFI_DIAMOND,
    encodeFunctionData({
      abi: lifiSwapAbi,
      functionName: 'swapTokensMultipleV3ERC20ToERC20',
      args: [
        `0x${'00'.repeat(32)}`,
        'zap-pilot',
        '',
        overrides.receiver ?? wallet,
        overrides.minOut ?? MIN_OUT,
        [
          leg(WETH, WETH, SWAP_FROM),
          leg(WETH, overrides.receivingAssetId ?? USDC, SWAP_FROM - 1n),
        ],
      ],
    }),
    'SWAP',
    '1051330',
  );
}

export function deposit(
  amount = MIN_OUT,
  receiver: `0x${string}` = wallet,
  vault = USDC_VAULT,
) {
  return tx(
    vault,
    encodeFunctionData({
      abi: erc4626Abi,
      functionName: 'deposit',
      args: [amount, receiver],
    }),
    'ROTATE_DEPOSIT',
  );
}

/** A rotation review as plan-orchestration returns it for the agent wallet. */
export function approvedReview({
  approveWeth = true,
  approveUsdc = false,
}: { approveWeth?: boolean; approveUsdc?: boolean } = {}) {
  const approvals = [
    ...(approveWeth ? [approve(WETH, LIFI_DIAMOND, SWAP_FROM)] : []),
    ...(approveUsdc ? [approve(USDC, USDC_VAULT, MIN_OUT)] : []),
  ];
  const calls = [redeem(), swap(), deposit()];
  const review = {
    plan: { approvals, calls, totalGasUsd: '0.01', sourceChainId: 8453 },
    planFingerprint: hash,
    reviewedAt: now,
    expiresAt: now + 300_000,
    reviews: {
      'chain-8453': {
        status: 'warning',
        groupId: 'chain-8453',
        groupFingerprint: hash,
        batchFingerprint: fingerprint(8453, [...approvals, ...calls]),
        reviewedAt: now,
        expiresAt: now + 300_000,
        expectedSimulationFingerprint: hash,
        expectedRiskHash: hash,
        blocked: false,
        executionAllowed: true,
        requiresRiskAcknowledgement: true,
        chainId: 8453,
        walletAddress: wallet,
        calls: [],
        assetChanges: [],
        approvals: [],
        contracts: [],
        warnings: [
          {
            code: 'UNDECODED_METHOD',
            message: `Call ${approvals.length + 2} method could not be decoded`,
            callIndex: approvals.length + 1,
            address: LIFI_DIAMOND.toLowerCase(),
          },
        ],
        blockNumber: 1,
        callGas: '100000',
        simulationIds: ['simulation'],
        shareUrls: [],
        simulationFingerprint: hash,
        riskHash: hash,
      },
    },
  } satisfies PlanOrchestrationRotateReviewResponse;
  return review as PlanOrchestrationRotateReviewResponse;
}

/**
 * Re-bind the review to the batch after a test mutates it (fingerprint and
 * the swap's warning index), so only the mutation itself is under test.
 */
export function refingerprint(review: PlanOrchestrationRotateReviewResponse) {
  const group = review.reviews['chain-8453']!;
  group.batchFingerprint = fingerprint(8453, [
    ...review.plan.approvals,
    ...review.plan.calls,
  ]);
  for (const warning of group.warnings)
    warning.callIndex = review.plan.approvals.length + 1;
}
