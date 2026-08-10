import type { Address, Hex } from 'viem';

import type { BridgeRouter } from '../bridges/bridge-router.js';
import type { BridgeQuote, BridgeSelection } from '../bridges/bridge.types.js';

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

function requestFromIntent(intent: BridgeIntentInput) {
  if (intent.destinationCall) {
    throw new Error('Destination contract calls are out of scope for v1');
  }
  return {
    fromChainId: intent.fromChainId,
    toChainId: intent.toChainId,
    fromToken: intent.fromToken,
    toToken: intent.toToken,
    fromAmount: intent.fromAmount,
    sender: intent.userAddress,
    recipient: intent.userAddress,
  };
}

export async function quoteBridge(
  intent: BridgeIntentInput,
  router: BridgeRouter,
): Promise<BridgeSelection> {
  return router.quote(requestFromIntent(intent));
}

export async function buildBridgeTx(
  intent: BridgeIntentInput,
  router: BridgeRouter,
): Promise<BridgeQuote> {
  return (await quoteBridge(intent, router)).selected;
}
