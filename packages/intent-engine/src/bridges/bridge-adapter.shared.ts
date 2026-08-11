import type { Hash } from 'viem';

import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../registry/chains.js';
import type { BridgeProvider } from './bridge-provider.js';
import { pollBridgeStatus } from './poll-bridge-status.js';
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
  if (!baseToArbitrum && !arbitrumToBase) {
    return false;
  }

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
  if (value && groups.filled?.includes(value)) {
    return 'filled';
  }
  if (value && groups.settled?.includes(value)) {
    return 'settled';
  }
  if (value && groups.failed.includes(value)) {
    return 'failed';
  }
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

export abstract class CanonicalBridgeProvider<
  TStatus,
> implements BridgeProvider {
  abstract readonly id: BridgeQuote['provider'];

  supports(request: BridgeQuoteRequest): boolean {
    return isCanonicalBaseArbitrumUsdc(request);
  }

  abstract quote(request: BridgeQuoteRequest): Promise<BridgeQuote>;

  protected abstract fetchStatus(input: BridgeTrackingInput): Promise<TStatus>;

  protected abstract settlementStatus(
    value: TStatus,
  ): BridgeSettlement['status'];

  protected abstract destinationTxHash(value: TStatus): Hash | undefined;

  async waitForCompletion(
    input: BridgeTrackingInput,
  ): Promise<BridgeSettlement> {
    const payload = await pollBridgeStatus({
      fetchStatus: () => this.fetchStatus(input),
      isTerminal: (value) => this.settlementStatus(value) !== 'pending',
      ...signalOptions(input.signal),
    });

    return bridgeSettlement({
      status: this.settlementStatus(payload),
      sourceTxHash: input.sourceTxHash,
      destinationTxHash: this.destinationTxHash(payload),
      providerData: payload,
    });
  }
}
