import type { PreparedTransaction } from '@zapengine/types/api';
import { keccak256, toBytes } from 'viem';

/** Inputs bound to the server's wallet-neutral deposit review fingerprint. */
export interface ReviewedBatchFingerprintInput {
  chainId: number;
  transactions: readonly PreparedTransaction[];
}

/**
 * Reproduce the canonical batch fingerprint used by account-engine. Approval
 * calls must already precede protocol calls in `transactions`; no sorting or
 * other normalization is performed here because order is security-sensitive.
 */
export function computeReviewedBatchFingerprint({
  chainId,
  transactions,
}: ReviewedBatchFingerprintInput): `0x${string}` {
  const material = {
    chainId,
    transactions: transactions.map((transaction) => ({
      chainId: transaction.chainId,
      to: transaction.to.toLowerCase(),
      data: transaction.data,
      value: BigInt(transaction.value).toString(),
    })),
  };
  return keccak256(toBytes(JSON.stringify(material)));
}
