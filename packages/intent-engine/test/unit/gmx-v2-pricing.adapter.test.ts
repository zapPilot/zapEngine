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
  function oracleTickers() {
    return [
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
    ];
  }

  it('quotes deposits with GMX oracle prices through SyntheticsReader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(oracleTickers()),
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

  it('falls back to the next oracle endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('primary offline'))
      .mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(oracleTickers()),
      });
    vi.stubGlobal('fetch', fetchMock);
    const readContract = vi.fn().mockResolvedValue(1n);

    await expect(
      new GmxV2ReaderPricingAdapter().getDepositAmountOut({
        publicClient: { readContract } as unknown as PublicClient,
        market: GMX_V2_MARKETS['btc-usdc'],
        longTokenAmount: 0n,
        shortTokenAmount: 1n,
      }),
    ).resolves.toBe(1n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'HTTP failures',
      { ok: false, status: 503, json: vi.fn() },
      'Failed to fetch GMX oracle prices',
    ],
    [
      'non-array payloads',
      { ok: true, json: vi.fn().mockResolvedValue({ tickers: [] }) },
      'Failed to fetch GMX oracle prices',
    ],
  ])(
    'rejects when every oracle endpoint returns %s',
    async (_label, response, message) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(
        new GmxV2ReaderPricingAdapter().getDepositAmountOut({
          publicClient: { readContract: vi.fn() } as unknown as PublicClient,
          market: GMX_V2_MARKETS['btc-usdc'],
          longTokenAmount: 0n,
          shortTokenAmount: 1n,
        }),
      ).rejects.toThrow(message);
    },
  );

  it('rejects when a required market token has no oracle ticker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(oracleTickers().slice(1)),
      }),
    );

    await expect(
      new GmxV2ReaderPricingAdapter().getDepositAmountOut({
        publicClient: { readContract: vi.fn() } as unknown as PublicClient,
        market: GMX_V2_MARKETS['btc-usdc'],
        longTokenAmount: 0n,
        shortTokenAmount: 1n,
      }),
    ).rejects.toThrow('GMX oracle price missing for token');
  });
});
