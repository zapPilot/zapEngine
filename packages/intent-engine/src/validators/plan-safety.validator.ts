import type { PreparedTransaction } from '@zapengine/types/api';
import { decodeFunctionData, erc20Abi, maxUint256 } from 'viem';

/**
 * Simulation-plane safety checks (ADR 0002 A5), exposed by the intent core so
 * every plan host — hosted plan-orchestration today, the local allocator
 * later — validates routes the same way. Pure functions; throw on violation.
 */
export class PlanSafetyViolationError extends Error {
  constructor(
    message: string,
    readonly code: 'APPROVAL_UNLIMITED' | 'APPROVAL_CAP' | 'MIN_RECEIVED',
  ) {
    super(message);
    this.name = 'PlanSafetyViolationError';
  }
}

function decodeApproval(
  tx: Pick<PreparedTransaction, 'to' | 'data'>,
): { spender: string; amount: bigint } | null {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as `0x${string}`,
    });
    if (decoded.functionName !== 'approve') return null;
    const [spender, amount] = decoded.args;
    return { spender, amount };
  } catch {
    return null;
  }
}

function routedEstimate(
  tx: PreparedTransaction,
): { toAmount: bigint; toAmountMin: bigint } | null {
  const route = tx.meta.route;
  if (typeof route !== 'object' || route === null) return null;
  const estimate = (route as { estimate?: unknown }).estimate;
  if (typeof estimate !== 'object' || estimate === null) return null;
  const { toAmount, toAmountMin } = estimate as {
    toAmount?: unknown;
    toAmountMin?: unknown;
  };
  if (typeof toAmount !== 'string' || typeof toAmountMin !== 'string') {
    return null;
  }
  try {
    return { toAmount: BigInt(toAmount), toAmountMin: BigInt(toAmountMin) };
  } catch {
    return null;
  }
}

/**
 * Every ERC-20 approve in the plan must be bounded: never unlimited, and an
 * approval of the intent's own source token may not exceed the intent amount.
 * Intermediate-token approvals (bridge legs) are bounded by the unlimited
 * rule only — their amounts come from quoted route outputs.
 */
export function assertApprovalCaps(
  plan: {
    approvals: PreparedTransaction[];
    calls: PreparedTransaction[];
  },
  intent: { fromToken?: string; fromAmount?: string },
): void {
  const fromToken = intent.fromToken?.toLowerCase();
  const fromAmount =
    intent.fromAmount === undefined ? undefined : BigInt(intent.fromAmount);

  for (const tx of [...plan.approvals, ...plan.calls]) {
    const approval = decodeApproval(tx);
    if (!approval) continue;

    if (approval.amount === maxUint256) {
      throw new PlanSafetyViolationError(
        `Plan grants an unlimited ${tx.to} approval to ${approval.spender}`,
        'APPROVAL_UNLIMITED',
      );
    }

    if (
      fromToken !== undefined &&
      fromAmount !== undefined &&
      tx.to.toLowerCase() === fromToken &&
      approval.amount > fromAmount
    ) {
      throw new PlanSafetyViolationError(
        `Plan approves ${approval.amount} of the source token, above the intent amount ${fromAmount}`,
        'APPROVAL_CAP',
      );
    }
  }
}

/**
 * Every routed call (LiFi swap/bridge) must quote a positive min-received
 * within the slippage cap: toAmountMin ≥ toAmount × (1 − maxSlippageBps/10000).
 * The quoted values were previously trusted verbatim (ADR 0002 gap map).
 */
export function assertMinReceived(
  plan: { calls: PreparedTransaction[] },
  opts: { maxSlippageBps: number },
): void {
  const bps = BigInt(Math.round(opts.maxSlippageBps));

  for (const tx of plan.calls) {
    const estimate = routedEstimate(tx);
    if (!estimate) continue;

    if (estimate.toAmountMin <= 0n) {
      throw new PlanSafetyViolationError(
        `Routed call to ${tx.to} quotes a non-positive min-received`,
        'MIN_RECEIVED',
      );
    }

    if (estimate.toAmountMin * 10_000n < estimate.toAmount * (10_000n - bps)) {
      throw new PlanSafetyViolationError(
        `Routed call to ${tx.to} quotes min-received ${estimate.toAmountMin} below the ${opts.maxSlippageBps} bps slippage cap on ${estimate.toAmount}`,
        'MIN_RECEIVED',
      );
    }
  }
}
