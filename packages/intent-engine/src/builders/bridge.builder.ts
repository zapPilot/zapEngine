import type { Address, Hex } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import type { TransactionQuote } from '../types/transaction.types.js';

export interface BridgeIntentInput {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  userAddress: Address;
  destinationCall?: {
    to: Address;
    data: Hex;
    gasLimit: string;
  };
}

export async function buildBridgeTx(
  intent: BridgeIntentInput,
  adapter: LiFiAdapter,
): Promise<TransactionQuote> {
  if (intent.destinationCall) {
    throw new Error('Destination contract calls are out of scope for v1');
  }

  return adapter.getQuote({
    fromChain: intent.fromChainId,
    toChain: intent.toChainId,
    fromToken: intent.fromToken,
    toToken: intent.toToken,
    fromAmount: intent.fromAmount,
    fromAddress: intent.userAddress,
    toAddress: intent.userAddress,
  });
}
