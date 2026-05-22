import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type PublicClient,
} from 'viem';

import type { PreparedTransaction } from '@zapengine/types/api';

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
  return {
    to: params.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spender, BigInt(params.amount)],
    }),
    value: '0',
    chainId: params.chainId,
    ...(params.gasLimit ? { gasLimit: params.gasLimit } : {}),
    meta: {
      intentType: params.intentType ?? 'ERC20_APPROVE',
    },
  };
}
