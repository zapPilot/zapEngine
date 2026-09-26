import type {
  PlanOrchestrationRotateReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import {
  decodeFunctionData,
  erc20Abi,
  erc4626Abi,
  type Hex,
  keccak256,
  parseAbi,
  toBytes,
} from 'viem';

import {
  ETH_VAULT,
  LIFI_DIAMOND,
  RULE_EXPIRES_AT,
  SHARES,
  USDC,
  USDC_VAULT,
  WETH,
} from './demoRule.js';

// LI.FI GenericSwapFacetV3: the selectors a same-chain ERC20 → ERC20 swap
// uses. Any other facet is refused rather than trusted blind.
export const lifiSwapAbi = parseAbi([
  'struct SwapData { address callTo; address approveTo; address sendingAssetId; address receivingAssetId; uint256 fromAmount; bytes callData; bool requiresDeposit; }',
  'function swapTokensSingleV3ERC20ToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData _swapData)',
  'function swapTokensMultipleV3ERC20ToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, SwapData[] _swapData)',
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

export interface GuardVerdict {
  allowed: boolean;
  reason: string;
  transactions: PreparedTransaction[];
  /** USDC the swap guarantees and the deposit spends; 0 when rejected. */
  depositAmount: bigint;
}

const reject = (reason: string): GuardVerdict => ({
  allowed: false,
  reason,
  transactions: [],
  depositAmount: 0n,
});

const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export function guard(
  review: PlanOrchestrationRotateReviewResponse,
  wallet: string,
  now = Date.now(),
): GuardVerdict {
  try {
    if (now >= RULE_EXPIRES_AT) return reject('Demo rule expired');
    if (review.expiresAt <= now + 60_000)
      return reject('Review expires too soon');
    const { plan } = review;
    const transactions = [...plan.approvals, ...plan.calls];
    if (
      plan.sourceChainId !== 8453 ||
      transactions.some((tx) => tx.chainId !== 8453)
    )
      return reject('Wrong chain');
    if (transactions.some((tx) => BigInt(tx.value) !== 0n))
      return reject('Native value forbidden');
    if (plan.calls.length !== 3 || plan.approvals.length > 2)
      return reject('Unexpected steps');
    const swapIndex = plan.approvals.length + 1;
    const groupFailure = checkReviewGroup(review, wallet, now, swapIndex);
    if (groupFailure) return reject(groupFailure);

    const [redeem, swap, deposit] = plan.calls as [
      PreparedTransaction,
      PreparedTransaction,
      PreparedTransaction,
    ];
    if (!same(redeem.to, ETH_VAULT)) return reject('Unexpected source vault');
    const redeemed = decodeFunctionData({
      abi: erc4626Abi,
      data: redeem.data as Hex,
    });
    if (
      redeemed.functionName !== 'redeem' ||
      redeemed.args[0] !== SHARES ||
      !same(redeemed.args[1], wallet) ||
      !same(redeemed.args[2], wallet)
    )
      return reject('Wrong redeem shares, receiver or owner');

    const route = decodeSwap(swap, wallet);
    if (!route.ok) return reject(route.reason);

    if (!same(deposit.to, USDC_VAULT))
      return reject('Unexpected destination vault');
    const deposited = decodeFunctionData({
      abi: erc4626Abi,
      data: deposit.data as Hex,
    });
    if (
      deposited.functionName !== 'deposit' ||
      deposited.args[0] !== route.minOut ||
      !same(deposited.args[1], wallet)
    )
      return reject('Deposit must be the swap minimum, for the agent');

    const approvalFailure = checkApprovals(plan.approvals, {
      [WETH.toLowerCase()]: { spender: LIFI_DIAMOND, amount: route.fromAmount },
      [USDC.toLowerCase()]: { spender: USDC_VAULT, amount: route.minOut },
    });
    if (approvalFailure) return reject(approvalFailure);
    return {
      allowed: true,
      reason: 'Passed',
      transactions,
      depositAmount: route.minOut,
    };
  } catch {
    return reject('Malformed review or calldata');
  }
}

function checkReviewGroup(
  review: PlanOrchestrationRotateReviewResponse,
  wallet: string,
  now: number,
  swapIndex: number,
): string | undefined {
  const groups = Object.entries(review.reviews);
  if (groups.length !== 1 || groups[0]![0] !== 'chain-8453')
    return 'Unexpected review groups';
  const group = groups[0]![1];
  if (group.blocked || !group.executionAllowed) return 'Review did not pass';
  // plan-orchestration never decodes LI.FI calldata, so the swap always
  // carries UNDECODED_METHOD; the guard decodes that call itself. Any other
  // warning, or this one on another call, still blocks.
  const acknowledged =
    group.status === 'warning' &&
    group.warnings.every(
      (warning) =>
        warning.code === 'UNDECODED_METHOD' &&
        warning.callIndex === swapIndex &&
        warning.address !== undefined &&
        same(warning.address, LIFI_DIAMOND),
    );
  if (group.status !== 'passed' && !acknowledged) return 'Review did not pass';
  if (group.requiresRiskAcknowledgement !== (group.status === 'warning'))
    return 'Review did not pass';
  if (group.chainId !== 8453 || !same(group.walletAddress, wallet))
    return 'Review wallet or chain mismatch';
  if (group.expiresAt <= now + 60_000) return 'Group review expires too soon';
  const transactions = [...review.plan.approvals, ...review.plan.calls];
  if (group.batchFingerprint !== fingerprint(8453, transactions))
    return 'Batch fingerprint mismatch';
  return undefined;
}

type SwapTerms =
  | { ok: true; fromAmount: bigint; minOut: bigint }
  | { ok: false; reason: string };

function decodeSwap(swap: PreparedTransaction, wallet: string): SwapTerms {
  const fail = (reason: string): SwapTerms => ({ ok: false, reason });
  if (!same(swap.to, LIFI_DIAMOND)) return fail('Unexpected swap target');
  const decoded = decodeFunctionData({
    abi: lifiSwapAbi,
    data: swap.data as Hex,
  });
  const [, , , receiver, minOut, swapData] = decoded.args;
  const legs = Array.isArray(swapData) ? swapData : [swapData];
  const first = legs[0];
  const last = legs.at(-1);
  if (!first || !last) return fail('Swap has no legs');
  if (!same(receiver, wallet)) return fail('Swap pays someone else');
  if (!same(first.sendingAssetId, WETH) || !same(last.receivingAssetId, USDC))
    return fail('Swap must sell WETH for USDC');
  if (minOut <= 0n) return fail('Swap has no minimum output');
  return { ok: true, fromAmount: first.fromAmount, minOut };
}

function checkApprovals(
  approvals: PreparedTransaction[],
  allowed: Record<string, { spender: string; amount: bigint }>,
): string | undefined {
  const seen = new Set<string>();
  for (const approval of approvals) {
    const token = approval.to.toLowerCase();
    const expected = allowed[token];
    if (!expected || seen.has(token)) return 'Unexpected approval token';
    seen.add(token);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: approval.data as Hex,
    });
    if (
      decoded.functionName !== 'approve' ||
      !same(decoded.args[0], expected.spender) ||
      decoded.args[1] !== expected.amount
    )
      return 'Unexpected approval';
  }
  return undefined;
}
