import type { Account, Address, Hex } from 'viem';

interface PreparedTransactionRequest {
  to: string;
  data: string;
  value: string | number;
  chainId: number;
  gasLimit?: string | number | undefined;
}

interface WalletTransactionRequest {
  account: Account;
  to: Address;
  data: Hex;
  value: bigint;
  chainId: number;
  gas?: bigint;
}

export function txRequest(
  tx: PreparedTransactionRequest,
  account: Account,
): WalletTransactionRequest {
  return {
    account,
    to: tx.to as Address,
    data: tx.data as Hex,
    value: BigInt(tx.value),
    chainId: tx.chainId,
    ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
  };
}
