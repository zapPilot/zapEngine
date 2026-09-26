import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type { GmxV2PricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildGmxV2SupplyTx } from '../../src/builders/gmx-v2-supply.builder.js';
import {
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const LIFI_TX_TARGET = '0x3333333333333333333333333333333333333333' as Address;
const PUBLIC_CLIENT = {} as PublicClient;

describe('buildGmxV2SupplyTx USDT swap without a LiFi approval', () => {
  it('skips the swap approval when the quote needs none', async () => {
    const quote: TransactionQuote = {
      transaction: {
        to: LIFI_TX_TARGET,
        data: '0x1234',
        value: '0',
        chainId: GMX_V2_ARBITRUM_CHAIN_ID,
        gasLimit: '300000',
        meta: {
          intentType: 'SWAP',
          route: { tool: 'lifi' },
        },
      },
      estimate: {
        fromAmount: '1000000',
        toAmount: '13000',
        toAmountMin: '12345',
        gasCostUsd: '0.02',
        executionDuration: 30,
      },
      route: {
        action: {
          fromToken: { address: GMX_V2_TOKENS.USDT.address },
          toToken: { address: GMX_V2_TOKENS.USDC.address },
        },
      },
    };
    const getSwapQuote = vi.fn().mockResolvedValue(quote);
    const getDepositAmountOut = vi.fn().mockResolvedValue(500000000000000000n);

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'btc-usdc',
        fromToken: GMX_V2_TOKENS.USDT.address,
        fromAmount: '1000000',
        userAddress: USER,
      },
      { getSwapQuote } as unknown as LiFiAdapter,
      PUBLIC_CLIENT,
      { getDepositAmountOut } as unknown as GmxV2PricingAdapter,
    );

    expect(getSwapQuote).toHaveBeenCalledOnce();
    expect(plan.steps.map((step) => step.meta.intentType)).toEqual([
      'SWAP',
      'SUPPLY',
    ]);
    // Only the GMX USDC approval remains; no USDT approval is queued.
    expect(plan.approvals).toHaveLength(1);
    expect(plan.approvals[0]!.to.toLowerCase()).toBe(
      GMX_V2_TOKENS.USDC.address.toLowerCase(),
    );
  });
});
