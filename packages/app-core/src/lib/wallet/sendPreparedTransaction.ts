import type { WalletProviderInterface } from '@core/types';
import type { PreparedTransaction } from '@zapengine/types/api';
import type { Address, Hash } from 'viem';

export function sendPreparedTransaction(
  wallet: Pick<WalletProviderInterface, 'sendTransaction'>,
  transaction: PreparedTransaction,
): Promise<Hash> {
  return wallet.sendTransaction({
    to: transaction.to as Address,
    data: transaction.data as `0x${string}`,
    value: BigInt(transaction.value),
    chainId: transaction.chainId,
    ...(transaction.gasLimit ? { gas: BigInt(transaction.gasLimit) } : {}),
  });
}
