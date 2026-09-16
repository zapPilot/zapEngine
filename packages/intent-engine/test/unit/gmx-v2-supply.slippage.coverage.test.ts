import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type { GmxV2PricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildGmxV2SupplyTx } from '../../src/builders/gmx-v2-supply.builder.js';
import {
  GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const PUBLIC_CLIENT = {} as PublicClient;
const ADAPTER = {} as LiFiAdapter;

const BASE_INPUT = {
  marketKey: 'eth-usdc' as const,
  fromToken: GMX_V2_TOKENS.USDC.address,
  fromAmount: '1000000',
  userAddress: USER,
};

function pricingAdapterFor(estimatedMarketTokens: bigint): GmxV2PricingAdapter {
  return {
    getDepositAmountOut: vi.fn().mockResolvedValue(estimatedMarketTokens),
  };
}

describe('buildGmxV2SupplyTx deposit slippage boundaries', () => {
  it.each([0n, 1n])(
    'rejects estimated GM-token output %s when no slippage buffer can remain',
    async (estimatedMarketTokens) => {
      await expect(
        buildGmxV2SupplyTx(
          BASE_INPUT,
          ADAPTER,
          PUBLIC_CLIENT,
          pricingAdapterFor(estimatedMarketTokens),
        ),
      ).rejects.toThrow(
        'GMX deposit amount is too small to retain a GM-token slippage buffer',
      );
    },
  );

  it('uses the default deposit slippage when slippageBps is omitted', async () => {
    const plan = await buildGmxV2SupplyTx(
      BASE_INPUT,
      ADAPTER,
      PUBLIC_CLIENT,
      pricingAdapterFor(10_000n),
    );

    expect(GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS).toBe(100);
    expect(plan.estimatedMarketTokens).toBe('10000');
    expect(plan.minMarketTokens).toBe('9900');
  });

  it.each([
    ['fractional', 0.5],
    ['zero', 0],
    ['above the maximum', GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS + 1],
  ] as const)(
    'rejects %s deposit slippage',
    async (_label, slippageBps) => {
      await expect(
        buildGmxV2SupplyTx(
          { ...BASE_INPUT, slippageBps },
          ADAPTER,
          PUBLIC_CLIENT,
          pricingAdapterFor(10_000n),
        ),
      ).rejects.toThrow(
        `GMX deposit slippage must be an integer from 1 to ${GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS} bps`,
      );
    },
  );
});
