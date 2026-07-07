import {
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  type Address,
  type PublicClient,
} from 'viem';

import type { PreparedTransaction } from '@zapengine/types/api';

import { PlanSafetyViolationError } from '../validators/plan-safety.validator.js';

export interface ApprovalRequirement {
  tokenAddress: Address;
  spenderAddress: Address;
  amount: bigint;
}

export async function needsApproval(params: {
  publicClient: PublicClient;
  owner: Address;
  requirement: ApprovalRequirement;
}): Promise<boolean> {
  try {
    const allowance = (await params.publicClient.readContract({
      address: params.requirement.tokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [params.owner, params.requirement.spenderAddress],
    })) as bigint;

    return allowance < params.requirement.amount;
  } catch (error) {
    // Fail open: an RPC hiccup or non-ERC20 contract must not silently skip
    // an approval the deposit needs. Surface the cause so a wrong
    // tokenAddress / paused contract / RPC outage is not invisible.
    console.warn(
      '[needsApproval] allowance lookup failed; assuming approval needed',
      {
        token: params.requirement.tokenAddress,
        spender: params.requirement.spenderAddress,
        owner: params.owner,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return true;
  }
}

export function buildApproveTx(params: {
  token: Address;
  spender: Address;
  amount: string;
  chainId: number;
  gasLimit?: string;
  intentType?: string;
}): PreparedTransaction {
  const amount = BigInt(params.amount);
  // Plans always know the exact amount they move (ADR 0002 A5) — an
  // unlimited approval is never legitimate on any zapPilot path.
  if (amount === maxUint256) {
    throw new PlanSafetyViolationError(
      `Refusing to build an unlimited ${params.token} approval for ${params.spender}`,
      'APPROVAL_UNLIMITED',
    );
  }
  return {
    to: params.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spender, amount],
    }),
    value: '0',
    chainId: params.chainId,
    ...(params.gasLimit ? { gasLimit: params.gasLimit } : {}),
    meta: {
      intentType: params.intentType ?? 'ERC20_APPROVE',
    },
  };
}
