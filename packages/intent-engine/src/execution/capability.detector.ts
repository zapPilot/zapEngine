import type { WalletClient } from 'viem';
import { getCapabilities } from 'viem/actions';

export type ExecutionStrategy = 'eip7702' | 'multicall3' | 'sequential';

/**
 * Detect if wallet supports EIP-7702 / atomic batching on a given chain.
 *
 * Uses EIP-5792 `wallet_getCapabilities` via viem. Modern EIP-5792 wallets
 * expose `atomic.status: 'supported' | 'ready' | 'unsupported'`:
 *   - `supported` → wallet can sign and broadcast an atomic bundle
 *   - `ready`     → EOA is already EIP-7702-delegated, ready to batch
 *   - `unsupported` → fall back to Multicall3
 *
 * Returns false on any request failure so callers fall back cleanly.
 *
 * @param wallet - Viem wallet client
 * @param chainId - Chain to query capabilities for (required; capabilities are chain-scoped)
 */
export async function detectEIP7702Support(
  wallet: WalletClient,
  chainId: number,
): Promise<boolean> {
  try {
    const capabilities = await getCapabilities(wallet, { chainId });
    const status = capabilities?.atomic?.status;
    return status === 'supported' || status === 'ready';
  } catch {
    return false;
  }
}

/**
 * Determine the best execution strategy for a wallet on a given chain.
 *
 * @param wallet - Viem wallet client (optional). When absent, returns 'multicall3'.
 * @param chainId - Chain to execute on. Required when a wallet is provided.
 */
export async function determineExecutionStrategy(
  wallet?: WalletClient,
  chainId?: number,
): Promise<ExecutionStrategy> {
  if (!wallet || chainId === undefined) {
    return 'multicall3';
  }

  const supportsAtomicBatch = await detectEIP7702Support(wallet, chainId);
  return supportsAtomicBatch ? 'eip7702' : 'multicall3';
}
