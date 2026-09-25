import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';

import { GmxV2ReaderPricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import { GmxDepositTooSmallError } from '../../src/errors/intent.errors.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

const BTC_USDC = GMX_V2_MARKETS['btc-usdc'];
const ETH_USDC = GMX_V2_MARKETS['eth-usdc'];
const BTC_BTC = GMX_V2_MARKETS['btc-btc'];

/** A direct USDC deposit into the short side of btc-usdc. */
function directUsdcDeposit(publicClient: PublicClient, amount: bigint) {
  return {
    publicClient,
    market: BTC_USDC,
    initialToken: GMX_V2_TOKENS.USDC.address,
    amount,
    side: 'short' as const,
    swapPath: [],
  };
}

function stubTickers(tickers: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(tickers),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function swapResult(amountOut: bigint) {
  return [amountOut, 0n, {}] as const;
}

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
      {
        tokenAddress: GMX_V2_TOKENS.WETH.address,
        minPrice: '2500000000000000',
        maxPrice: '2501000000000000',
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

    const result = await new GmxV2ReaderPricingAdapter().getDepositAmountOut(
      directUsdcDeposit(publicClient, 1100000n),
    );

    expect(result).toBe(493000000000000000n);
    expect(readContract).toHaveBeenCalledOnce();
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
      new GmxV2ReaderPricingAdapter().getDepositAmountOut(
        directUsdcDeposit({ readContract } as unknown as PublicClient, 1n),
      ),
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
        new GmxV2ReaderPricingAdapter().getDepositAmountOut(
          directUsdcDeposit(
            { readContract: vi.fn() } as unknown as PublicClient,
            1n,
          ),
        ),
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
      new GmxV2ReaderPricingAdapter().getDepositAmountOut(
        directUsdcDeposit(
          { readContract: vi.fn() } as unknown as PublicClient,
          1n,
        ),
      ),
    ).rejects.toThrow('GMX oracle price missing for token');
  });

  it('quotes each swap hop before the deposit it funds', async () => {
    const fetchMock = stubTickers(oracleTickers());
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(swapResult(62n))
      .mockResolvedValueOnce(39_620_000_000_000_000n);

    const result = await new GmxV2ReaderPricingAdapter().getDepositAmountOut({
      publicClient: { readContract } as unknown as PublicClient,
      market: BTC_BTC,
      initialToken: GMX_V2_TOKENS.USDC.address,
      amount: 53_200n,
      side: 'long',
      swapPath: [BTC_USDC],
    });

    expect(result).toBe(39_620_000_000_000_000n);
    // One oracle snapshot prices the hop and the deposit alike.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readContract.mock.calls[0]![0]).toMatchObject({
      address: GMX_V2_ADDRESSES.syntheticsReader,
      functionName: 'getSwapAmountOut',
      args: [
        GMX_V2_ADDRESSES.dataStore,
        expect.objectContaining({ marketToken: BTC_USDC.marketToken }),
        expect.any(Object),
        GMX_V2_TOKENS.USDC.address,
        53_200n,
        expect.any(String),
      ],
    });
    // The hop's WBTC.b output funds the long side of the single-token pool.
    expect(readContract.mock.calls[1]![0]).toMatchObject({
      functionName: 'getDepositAmountOut',
      args: [
        GMX_V2_ADDRESSES.dataStore,
        expect.objectContaining({ marketToken: BTC_BTC.marketToken }),
        expect.any(Object),
        62n,
        0n,
        expect.any(String),
        3,
        true,
      ],
    });
  });

  it('feeds each hop output into the next hop', async () => {
    stubTickers(oracleTickers());
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(swapResult(50_000n))
      .mockResolvedValueOnce(swapResult(59n))
      .mockResolvedValueOnce(38_000_000_000_000_000n);

    await new GmxV2ReaderPricingAdapter().getDepositAmountOut({
      publicClient: { readContract } as unknown as PublicClient,
      market: BTC_BTC,
      initialToken: GMX_V2_TOKENS.WETH.address,
      amount: 20_000_000_000_000n,
      side: 'long',
      swapPath: [ETH_USDC, BTC_USDC],
    });

    const hopInputs = readContract.mock.calls
      .slice(0, 2)
      .map(([call]) => (call as { args: unknown[] }).args.slice(3, 5));
    expect(hopInputs).toEqual([
      [GMX_V2_TOKENS.WETH.address, 20_000_000_000_000n],
      [GMX_V2_TOKENS.USDC.address, 50_000n],
    ]);
  });

  it('rejects a deposit whose swap rounds to zero before quoting the mint', async () => {
    stubTickers(oracleTickers());
    const readContract = vi.fn().mockResolvedValueOnce(swapResult(0n));

    await expect(
      new GmxV2ReaderPricingAdapter().getDepositAmountOut({
        publicClient: { readContract } as unknown as PublicClient,
        market: BTC_BTC,
        initialToken: GMX_V2_TOKENS.USDC.address,
        amount: 1n,
        side: 'long',
        swapPath: [BTC_USDC],
      }),
    ).rejects.toBeInstanceOf(GmxDepositTooSmallError);
    expect(readContract).toHaveBeenCalledOnce();
  });
});
