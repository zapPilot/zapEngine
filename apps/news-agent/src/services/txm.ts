import { keccak256 } from 'viem';

import type { TxmTransaction } from '../lib/multibaas.js';
import type { Step } from './types.js';

export function txmOutcome(
  tx: TxmTransaction,
): 'confirmed' | 'failed' | 'needs_attention' | 'pending' {
  switch (tx.status) {
    case 'included':
      if (tx.failed === undefined) return 'pending';
      return tx.failed ? 'failed' : 'confirmed';
    case 'cancelled':
    case 'rejected':
      return 'failed';
    case 'exceeded retry limit':
      return 'needs_attention';
    case 'pending':
    case 'replaced':
      return 'pending';
  }
}
// The SDK marks `failed` optional; the chain receipt is authoritative when TXM omits it.
export async function withReceipt(
  tx: TxmTransaction,
  receipt: (hash: `0x${string}`) => Promise<'success' | 'reverted' | null>,
): Promise<TxmTransaction> {
  if (tx.status !== 'included' || tx.failed !== undefined) return tx;
  const status = await receipt(tx.tx.hash as `0x${string}`);
  return status === null ? tx : { ...tx, failed: status === 'reverted' };
}
export function matches(tx: TxmTransaction, step: Step): boolean {
  return (
    tx.from.toLowerCase() === step.payload.from.toLowerCase() &&
    Number(BigInt(tx.tx.nonce)) === step.nonce &&
    tx.tx.to.toLowerCase() === step.to.toLowerCase() &&
    BigInt(tx.tx.value) === BigInt(step.value) &&
    keccak256(tx.tx.input as `0x${string}`) === step.dataHash
  );
}
export function txmDescription(tx: TxmTransaction): string {
  if (tx.status !== 'included') return tx.status;
  if (tx.failed === undefined) return 'inclusion outcome unknown';
  return tx.failed ? 'reverted' : 'included';
}
