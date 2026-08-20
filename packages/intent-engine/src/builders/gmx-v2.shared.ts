import { type Hex } from 'viem';

import { buildApproveTx } from '../approvals/erc20Approval.js';
import {
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_GAS_ESTIMATES,
} from '../protocols/gmx-v2/index.js';
import {
  PreparedTransactionSchema,
  type PreparedTransaction,
} from '../types/transaction.types.js';

export function createApprovalTx(params: {
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  amount: string;
}): PreparedTransaction {
  const approval = buildApproveTx({
    token: params.tokenAddress,
    spender: params.spenderAddress,
    amount: params.amount,
    chainId: GMX_V2_ARBITRUM_CHAIN_ID,
    gasLimit: GMX_V2_GAS_ESTIMATES.approve,
    intentType: 'APPROVAL',
  });
  return PreparedTransactionSchema.parse({
    ...approval,
    meta: {
      ...approval.meta,
      estimatedGas: GMX_V2_GAS_ESTIMATES.approve,
      estimatedDuration: 0,
    },
  });
}

export function validatePositiveAmount(
  amount: string,
  errorMessage: string,
): bigint {
  const parsed = BigInt(amount);
  if (parsed <= 0n) {
    throw new Error(errorMessage);
  }
  return parsed;
}

export function validateAllTransactions(
  transactions: PreparedTransaction[],
): void {
  for (const tx of transactions) {
    PreparedTransactionSchema.parse({
      ...tx,
      data: tx.data as Hex,
    });
  }
}
