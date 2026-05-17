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
  } catch {
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
