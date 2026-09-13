import type { PreparedTransaction } from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';

import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../../registry/chains.js';

/** Official Hyperliquid Bridge2 escrow on Arbitrum One. */
export const HYPERLIQUID_BRIDGE2_ADDRESS =
  '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7' as Address;

/**
 * Deposit native Arbitrum USDC into Hyperliquid Bridge2.
 *
 * Bridge2 credits the Hyperliquid account matching `msg.sender`, so the
 * correct on-chain action is a plain ERC-20 transfer from the user's wallet
 * to the bridge escrow. No approval is required and no Hyperliquid signature
 * is involved in this funding step.
 */
export function buildHyperliquidBridge2DepositTx(params: {
  amount: string;
}): PreparedTransaction {
  const usdc = USDC_ADDRESS[SUPPORTED_CHAINS.ARBITRUM];
  if (!usdc) {
    throw new Error('Arbitrum USDC is not configured');
  }
  if (BigInt(params.amount) <= 0n) {
    throw new Error('Hyperliquid Bridge2 deposit amount must be positive');
  }

  return {
    to: usdc,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE2_ADDRESS, BigInt(params.amount)],
    }),
    value: '0',
    chainId: SUPPORTED_CHAINS.ARBITRUM,
    meta: {
      intentType: 'BRIDGE',
      estimatedDuration: 60,
      route: {
        tool: 'hyperliquid-bridge2',
        bridgeAddress: HYPERLIQUID_BRIDGE2_ADDRESS,
        fromChainId: SUPPORTED_CHAINS.ARBITRUM,
      },
    },
  };
}
