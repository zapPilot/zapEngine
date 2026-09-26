import type { PreparedTransaction } from '@zapengine/types/api';
import {
  createPublicClient,
  http,
  TransactionReceiptNotFoundError,
} from 'viem';
import { base } from 'viem/chains';

import type { SigningPayload } from './multibaas.js';

export function createChain(url: string) {
  const client = createPublicClient({
    chain: base,
    transport: http(url, { timeout: 30_000, retryCount: 0 }),
  });
  return {
    async assertChain() {
      if ((await client.getChainId()) !== 8453)
        throw new Error('RPC chain must be Base mainnet');
    },
    nonce: (wallet: `0x${string}`, blockTag: 'pending' | 'latest') =>
      client.getTransactionCount({ address: wallet, blockTag }),
    receipt: async (
      hash: `0x${string}`,
    ): Promise<'success' | 'reverted' | null> => {
      try {
        return (await client.getTransactionReceipt({ hash })).status;
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error;
      }
    },
    async prepare(
      tx: PreparedTransaction,
      wallet: `0x${string}`,
      nonce: number,
    ): Promise<SigningPayload> {
      const request = {
        account: wallet,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
      };
      const [estimate, fees] = await Promise.all([
        client.estimateGas(request),
        client.estimateFeesPerGas(),
      ]);
      const buffered = (estimate * 120n + 99n) / 100n;
      const gas =
        BigInt(tx.gasLimit ?? '0') > buffered ? BigInt(tx.gasLimit!) : buffered;
      if (gas > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Gas exceeds safe integer range');
      return {
        from: wallet,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        gas: Number(gas),
        type: 2,
        nonce,
        gasFeeCap: fees.maxFeePerGas.toString(),
        gasTipCap: fees.maxPriorityFeePerGas.toString(),
      };
    },
  };
}
