import type { WalletClient } from 'viem';
import { getCapabilities } from 'viem/actions';

export type ExecutionStrategy = 'eip7702' | 'sequential';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getAtomicStatus(capabilities: unknown): string | undefined {
  if (!isObject(capabilities)) {
    return undefined;
  }

  const atomic = capabilities['atomic'];
  if (!isObject(atomic)) {
    return undefined;
  }

  return typeof atomic['status'] === 'string' ? atomic['status'] : undefined;
}

function getCapabilitiesForChain(
  capabilities: unknown,
  chainId: number,
): unknown {
  if (!isObject(capabilities)) {
    return undefined;
  }

  for (const [candidateChainId, candidateCapabilities] of Object.entries(
    capabilities,
  )) {
    if (Number(candidateChainId) === chainId) {
      return candidateCapabilities;
    }
  }

  return undefined;
}

function isAtomicSupported(status: string | undefined): boolean {
  return status === 'supported' || status === 'ready';
}

/**
 * Detect if wallet supports EIP-7702 / atomic batching on a given chain.
 *
 * Uses EIP-5792 `wallet_getCapabilities` via viem. Modern EIP-5792 wallets
 * expose `atomic.status: 'supported' | 'ready' | 'unsupported'`:
 *   - `supported` → wallet can sign and broadcast an atomic bundle
 *   - `ready`     → EOA is already EIP-7702-delegated, ready to batch
 *   - `unsupported` → fall back to sequential EOA transactions
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
    const chainScopedCapabilities = await getCapabilities(wallet, { chainId });
    const chainScopedStatus = getAtomicStatus(chainScopedCapabilities);
    if (chainScopedStatus === 'unsupported') {
      return false;
    }
    if (isAtomicSupported(chainScopedStatus)) {
      return true;
    }

    const allCapabilities = await getCapabilities(wallet);
    const chainStatus = getAtomicStatus(
      getCapabilitiesForChain(allCapabilities, chainId),
    );
    if (chainStatus === 'unsupported') {
      return false;
    }
    if (isAtomicSupported(chainStatus)) {
      return true;
    }

    return isAtomicSupported(
      getAtomicStatus(getCapabilitiesForChain(allCapabilities, 0)),
    );
  } catch {
    return false;
  }
}

/**
 * Determine the best execution strategy for a wallet on a given chain.
 *
 * @param wallet - Viem wallet client (optional). When absent, returns 'sequential'.
 * @param chainId - Chain to execute on. Required when a wallet is provided.
 */
export async function determineExecutionStrategy(
  wallet?: WalletClient,
  chainId?: number,
): Promise<ExecutionStrategy> {
  if (!wallet || chainId === undefined) {
    return 'sequential';
  }

  const supportsAtomicBatch = await detectEIP7702Support(wallet, chainId);
  return supportsAtomicBatch ? 'eip7702' : 'sequential';
}
