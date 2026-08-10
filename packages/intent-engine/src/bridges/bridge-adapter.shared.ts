import type { Hash } from 'viem';

import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../registry/chains.js';
import type {
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeSettlement,
} from './bridge.types.js';

export type FetchLike = typeof fetch;

export interface BridgeTrackingInput {
  quote?: BridgeQuote;
  sourceTxHash: Hash;
  fromChainId?: number;
  toChainId?: number;
  signal?: AbortSignal;
}

export function isCanonicalBaseArbitrumUsdc(
  request: BridgeQuoteRequest,
): boolean {
  const baseToArbitrum =
    request.fromChainId === SUPPORTED_CHAINS.BASE &&
    request.toChainId === SUPPORTED_CHAINS.ARBITRUM;
  const arbitrumToBase =
    request.fromChainId === SUPPORTED_CHAINS.ARBITRUM &&
    request.toChainId === SUPPORTED_CHAINS.BASE;
  if (!baseToArbitrum && !arbitrumToBase) return false;

  return (
    request.fromToken.toLowerCase() ===
      USDC_ADDRESS[request.fromChainId]?.toLowerCase() &&
    request.toToken.toLowerCase() ===
      USDC_ADDRESS[request.toChainId]?.toLowerCase()
  );
}

export function quoteIdentity(
  request: BridgeQuoteRequest,
): Pick<BridgeQuote, 'fromChainId' | 'toChainId' | 'fromToken' | 'toToken'> {
  return {
    fromChainId: request.fromChainId,
    toChainId: request.toChainId,
    fromToken: request.fromToken,
    toToken: request.toToken,
  };
}

export function normalizeBridgeStatus(
  status: string | undefined,
  groups: {
    filled?: readonly string[];
    settled?: readonly string[];
    failed: readonly string[];
  },
): BridgeSettlement['status'] {
  const value = status?.toLowerCase();
  if (value && groups.filled?.includes(value)) return 'filled';
  if (value && groups.settled?.includes(value)) return 'settled';
  if (value && groups.failed.includes(value)) return 'failed';
  return 'pending';
}

export function bridgeSettlement(params: {
  status: BridgeSettlement['status'];
  sourceTxHash: Hash;
  destinationTxHash?: Hash;
  providerData: unknown;
}): BridgeSettlement {
  return {
    status: params.status,
    sourceTxHash: params.sourceTxHash,
    ...(params.destinationTxHash
      ? { destinationTxHash: params.destinationTxHash }
      : {}),
    providerData: params.providerData,
  };
}

export function signalOptions(
  signal: AbortSignal | undefined,
): { signal: AbortSignal } | Record<string, never> {
  return signal ? { signal } : {};
}
