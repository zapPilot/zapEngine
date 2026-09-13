import {
  encodeBridge2Deposit,
  HYPERCORE_CHAIN_ID,
  HYPERLIQUID_BRIDGE2_ADDRESS,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
  HYPERLIQUID_BRIDGE2_DURATION_SEC,
  HYPERLIQUID_BRIDGE2_GAS_LIMIT,
} from '../protocols/hyperliquid/index.js';
import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../registry/chains.js';
import type { TransactionQuote } from '../types/transaction.types.js';

/**
 * Fund a HyperCore account through Hyperliquid's own Bridge2 escrow instead of
 * a LI.FI route. Only native Arbitrum USDC qualifies — the escrow accepts that
 * one token — and in exchange the deposit is 1:1 with no bridge fee and no
 * route to poll. Synchronous: there is nothing to quote.
 *
 * The 1:1 promise is published as `meta.route.estimate` so the shared
 * `assertMinReceived` gate sees an explicit min-received rather than skipping
 * the call as unrouted.
 */
export function buildHyperliquidBridge2DepositTx(params: {
  /** Arbitrum USDC to escrow, 6-decimal base units. */
  amount: string;
}): TransactionQuote {
  const usdc = USDC_ADDRESS[SUPPORTED_CHAINS.ARBITRUM];
  if (!usdc) {
    throw new Error('No USDC address configured for Arbitrum');
  }

  const estimate = {
    fromAmount: params.amount,
    toAmount: params.amount,
    toAmountMin: params.amount,
    gasCostUsd: '0',
    feeCostUsd: '0',
    executionDuration: HYPERLIQUID_BRIDGE2_DURATION_SEC,
    tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
  };

  return {
    transaction: {
      to: usdc,
      data: encodeBridge2Deposit(BigInt(params.amount)),
      value: '0',
      chainId: SUPPORTED_CHAINS.ARBITRUM,
      gasLimit: HYPERLIQUID_BRIDGE2_GAS_LIMIT,
      meta: {
        intentType: 'BRIDGE',
        estimatedDuration: HYPERLIQUID_BRIDGE2_DURATION_SEC,
        route: {
          tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
          bridgeAddress: HYPERLIQUID_BRIDGE2_ADDRESS,
          fromChainId: SUPPORTED_CHAINS.ARBITRUM,
          toChainId: HYPERCORE_CHAIN_ID,
          estimate,
        },
      },
    },
    estimate,
    route: {
      tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
      estimate,
    },
  };
}
