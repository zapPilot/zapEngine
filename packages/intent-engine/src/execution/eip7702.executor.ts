import type { Hash, WalletClient } from 'viem';
import { sendCalls, waitForCallsStatus } from 'viem/actions';

import { ExecutionError } from '../errors/intent.errors.js';
import type {
  ExecutionResult,
  PreparedTransaction,
} from '../types/transaction.types.js';

/**
 * Execute a batch of transactions via EIP-5792 `wallet_sendCalls`.
 *
 * Wallets that support EIP-7702 atomic execution will sign a single authorization
 * and dispatch the batch atomically; others may fall back to sequential sending.
 * Setting `forceAtomic: true` rejects wallets that cannot execute atomically —
 * callers that don't want that should handle the rejection and retry via
 * `encodeMulticall3` + a standard tx.
 *
 * The returned result carries a `callsId` — opaque to the caller. Use
 * {@link waitForEIP7702Confirmation} to resolve it into a tx hash/receipt.
 */
export async function executeWithEIP7702(
  txs: PreparedTransaction[],
  wallet: WalletClient,
): Promise<ExecutionResult> {
  if (txs.length === 0) {
    throw new ExecutionError('Cannot execute empty transaction array');
  }

  try {
    if (!wallet.account) {
      throw new ExecutionError('Wallet has no connected account');
    }

    const { id: callsId } = await sendCalls(wallet, {
      account: wallet.account,
      calls: txs.map((tx) => ({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
      })),
      forceAtomic: true,
    });

    return {
      success: true,
      callsId,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during EIP-7702 execution',
    };
  }
}

/**
 * Wait for an EIP-5792 call bundle to finalize.
 *
 * Polls `wallet_getCallsStatus` until the bundle succeeds, fails, or times out.
 * Returns the final bundle status plus the first receipt's transaction hash
 * (which for EIP-7702 atomic bundles covers all calls).
 *
 * @param callsId - The `id` returned by {@link executeWithEIP7702}
 * @param wallet - The same wallet client that submitted the bundle
 */
export async function waitForEIP7702Confirmation(
  callsId: string,
  wallet: WalletClient,
): Promise<{
  status: 'success' | 'failure';
  transactionHash?: Hash;
  receipts?: readonly unknown[];
}> {
  const result = await waitForCallsStatus(wallet, {
    id: callsId,
    throwOnFailure: false,
  });

  const firstTxHash = result.receipts?.[0]?.transactionHash;

  return {
    status: result.status === 'success' ? 'success' : 'failure',
    transactionHash: firstTxHash,
    receipts: result.receipts,
  };
}
