import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';

import { GmxV2ReaderPricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GmxV2ReaderPricingAdapter', () => {
  it('quotes deposits with GMX oracle prices through SyntheticsReader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            tokenAddress: GMX_V2_MARKETS['btc-usdc'].indexToken,
            minPrice: '640000000000000000000000000',
            maxPrice: '641000000000000000000000000',
          },
          {
            tokenAddress: GMX_V2_TOKENS.WBTC_B.address,
            minPrice: '640000000000000000000000000',
            maxPrice: '641000000000000000000000000',
          },
          {
            tokenAddress: GMX_V2_TOKENS.USDC.address,
            minPrice: '999900000000000000000000',
            maxPrice: '1000100000000000000000000',
          },
        ]),
      }),
    );
    const readContract = vi.fn().mockResolvedValue(493000000000000000n);
    const publicClient = { readContract } as unknown as PublicClient;

    const result = await new GmxV2ReaderPricingAdapter().getDepositAmountOut({
      publicClient,
      market: GMX_V2_MARKETS['btc-usdc'],
      longTokenAmount: 0n,
      shortTokenAmount: 1100000n,
    });

    expect(result).toBe(493000000000000000n);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: GMX_V2_ADDRESSES.syntheticsReader,
        functionName: 'getDepositAmountOut',
        args: expect.arrayContaining([
          GMX_V2_ADDRESSES.dataStore,
          0n,
          1100000n,
          3,
          true,
        ]),
      }),
    );
  });
});
