import type {
  PlanOrchestrationDepositReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import {
  decodeFunctionData,
  erc20Abi,
  keccak256,
  parseAbi,
  toBytes,
} from 'viem';

import { AMOUNT, RULE_EXPIRES_AT, USDC, VAULT } from './demoRule.js';

const vaultAbi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);
export function fingerprint(
  chainId: number,
  transactions: PreparedTransaction[],
): string {
  return keccak256(
    toBytes(
      JSON.stringify({
        chainId,
        transactions: transactions.map((call) => ({
          chainId: call.chainId,
          to: call.to.toLowerCase(),
          data: call.data,
          value: BigInt(call.value).toString(),
        })),
      }),
    ),
  );
}

const reject = (reason: string) => ({
  allowed: false,
  reason,
  transactions: [],
});

export function guard(
  review: PlanOrchestrationDepositReviewResponse,
  wallet: string,
  now = Date.now(),
): { allowed: boolean; reason: string; transactions: PreparedTransaction[] } {
  try {
    if (now >= RULE_EXPIRES_AT) return reject('Demo rule expired');
    if (review.expiresAt <= now + 60_000)
      return reject('Review expires too soon');
    const plan = review.plan;
    if ('executionGroups' in plan || (plan.followUps?.length ?? 0) > 0)
      return reject('Only a single Base deposit group is supported');
    const transactions = [...plan.approvals, ...plan.calls];
    if (
      plan.sourceChainId !== 8453 ||
      transactions.some((tx) => tx.chainId !== 8453)
    )
      return reject('Wrong chain');
    if (
      plan.approvals.length > 1 ||
      plan.calls.length !== 1 ||
      transactions.length > 2
    )
      return reject('Unexpected steps');
    if (transactions.some((tx) => BigInt(tx.value) !== 0n))
      return reject('Native value forbidden');
    const groups = Object.entries(review.reviews);
    if (groups.length !== 1 || groups[0]![0] !== 'chain-8453')
      return reject('Unexpected review groups');
    for (const [, group] of groups) {
      if (
        group.status !== 'passed' ||
        !group.executionAllowed ||
        group.blocked ||
        group.requiresRiskAcknowledgement
      )
        return reject('Review did not pass');
      if (
        group.chainId !== 8453 ||
        group.walletAddress.toLowerCase() !== wallet.toLowerCase()
      )
        return reject('Review wallet or chain mismatch');
      if (group.expiresAt <= now + 60_000)
        return reject('Group review expires too soon');
      if (group.batchFingerprint !== fingerprint(8453, transactions))
        return reject('Batch fingerprint mismatch');
    }
    const approvalFailure = checkApprovals(plan.approvals);
    if (approvalFailure) return reject(approvalFailure);
    const call = plan.calls[0]!;
    if (call.to.toLowerCase() !== VAULT.toLowerCase())
      return reject('Unexpected vault');
    const deposit = decodeFunctionData({
      abi: vaultAbi,
      data: call.data as `0x${string}`,
    });
    if (
      deposit.args[0] !== AMOUNT ||
      deposit.args[1].toLowerCase() !== wallet.toLowerCase()
    )
      return reject('Wrong deposit amount or receiver');
    return { allowed: true, reason: 'Passed', transactions };
  } catch {
    return reject('Malformed review or calldata');
  }
}

function checkApprovals(approvals: PreparedTransaction[]): string | undefined {
  for (const approval of approvals) {
    if (approval.to.toLowerCase() !== USDC.toLowerCase())
      return 'Unexpected approval token';
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: approval.data as `0x${string}`,
    });
    if (
      decoded.functionName !== 'approve' ||
      decoded.args[0].toLowerCase() !== VAULT.toLowerCase() ||
      decoded.args[1] > AMOUNT
    )
      return 'Unexpected approval';
  }
  return undefined;
}
