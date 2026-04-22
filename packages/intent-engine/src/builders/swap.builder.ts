import type { Address } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import type { SwapIntentInput } from '../types/intent.types.js';
import type { TransactionQuote } from '../types/transaction.types.js';
import { validateSwapIntent } from '../validators/intent.validator.js';

/**
 * Build a swap transaction using LI.FI
 *
 * @param intent - The swap intent with source/destination tokens and amount
 * @param adapter - LI.FI adapter instance
 * @returns Transaction quote ready for execution
 */
export async function buildSwapTx(
  intent: SwapIntentInput,
  adapter: LiFiAdapter,
): Promise<TransactionQuote> {
  // Validate intent (throws on invalid)
  const validated = validateSwapIntent(intent);

  return adapter.getSwapQuote({
    fromChain: validated.chainId,
    toChain: validated.chainId, // Same-chain swap for POC
    fromToken: validated.fromToken as Address,
    toToken: validated.toToken as Address,
    fromAmount: validated.fromAmount,
    fromAddress: validated.fromAddress as Address,
    slippageBps: validated.slippageBps,
  });
}
