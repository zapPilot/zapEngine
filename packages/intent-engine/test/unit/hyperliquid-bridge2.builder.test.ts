import { PreparedTransactionSchema } from '@zapengine/types/api';
import { decodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';

import { buildHyperliquidBridge2DepositTx } from '../../src/builders/hyperliquid-bridge2.builder.js';
import {
  HYPERCORE_CHAIN_ID,
  HYPERLIQUID_BRIDGE2_ADDRESS,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
  HYPERLIQUID_BRIDGE2_DURATION_SEC,
} from '../../src/protocols/hyperliquid/index.js';
import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../../src/registry/chains.js';
import { assertMinReceived } from '../../src/validators/plan-safety.validator.js';

const ARBITRUM_USDC = USDC_ADDRESS[SUPPORTED_CHAINS.ARBITRUM]!;

describe('buildHyperliquidBridge2DepositTx', () => {
  it('targets the Arbitrum USDC contract with a transfer to the escrow', () => {
    const quote = buildHyperliquidBridge2DepositTx({ amount: '25000000' });

    expect(quote.transaction.to).toBe(ARBITRUM_USDC);
    expect(quote.transaction.chainId).toBe(SUPPORTED_CHAINS.ARBITRUM);
    expect(quote.transaction.value).toBe('0');
    expect(quote.transaction.gasLimit).toBe('100000');
    expect(
      decodeFunctionData({
        abi: erc20Abi,
        data: quote.transaction.data as `0x${string}`,
      }),
    ).toEqual({
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE2_ADDRESS, 25_000_000n],
    });
    expect(PreparedTransactionSchema.safeParse(quote.transaction).success).toBe(
      true,
    );
  });

  it('quotes the escrow 1:1 with no bridge fee and names HyperCore as the destination', () => {
    const quote = buildHyperliquidBridge2DepositTx({ amount: '25000000' });

    expect(quote.estimate).toEqual({
      fromAmount: '25000000',
      toAmount: '25000000',
      toAmountMin: '25000000',
      gasCostUsd: '0',
      feeCostUsd: '0',
      executionDuration: HYPERLIQUID_BRIDGE2_DURATION_SEC,
      tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
    });
    expect(quote.route).toMatchObject({ tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID });
    expect(quote.transaction.meta.route).toMatchObject({
      tool: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
      bridgeAddress: HYPERLIQUID_BRIDGE2_ADDRESS,
      fromChainId: SUPPORTED_CHAINS.ARBITRUM,
      toChainId: HYPERCORE_CHAIN_ID,
    });
  });

  it('never needs an ERC-20 approval', () => {
    expect(
      buildHyperliquidBridge2DepositTx({ amount: '25000000' }).approval,
    ).toBeUndefined();
  });

  it('publishes a min-received the shared slippage gate accepts', () => {
    const quote = buildHyperliquidBridge2DepositTx({ amount: '25000000' });

    expect(() =>
      assertMinReceived({ calls: [quote.transaction] }, { maxSlippageBps: 0 }),
    ).not.toThrow();
  });

  it('fails closed when Arbitrum USDC is not configured', () => {
    const addresses = USDC_ADDRESS as Partial<typeof USDC_ADDRESS>;
    const original = addresses[SUPPORTED_CHAINS.ARBITRUM];
    addresses[SUPPORTED_CHAINS.ARBITRUM] = undefined;

    try {
      expect(() =>
        buildHyperliquidBridge2DepositTx({ amount: '25000000' }),
      ).toThrow('No USDC address configured for Arbitrum');
    } finally {
      addresses[SUPPORTED_CHAINS.ARBITRUM] = original;
    }
  });

  it('rejects a zero deposit', () => {
    expect(() => buildHyperliquidBridge2DepositTx({ amount: '0' })).toThrow(
      'Hyperliquid Bridge2 deposit amount must be positive',
    );
  });
});
