import type { Hash } from 'viem';

import type {
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeSettlement,
} from './bridge.types.js';

export interface BridgeProvider {
  readonly id: BridgeQuote['provider'];

  supports(request: BridgeQuoteRequest): boolean | Promise<boolean>;

  quote(request: BridgeQuoteRequest): Promise<BridgeQuote>;

  waitForCompletion(input: {
    quote?: BridgeQuote;
    sourceTxHash: Hash;
    fromChainId?: number;
    toChainId?: number;
    signal?: AbortSignal;
  }): Promise<BridgeSettlement>;
}
