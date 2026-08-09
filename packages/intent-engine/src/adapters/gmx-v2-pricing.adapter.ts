import { getAddress, zeroAddress, type Address, type PublicClient } from 'viem';

import {
  GMX_V2_ADDRESSES,
  GMX_V2_ORACLE_URLS,
  GMX_V2_READER_ABI,
  type GmxV2Market,
} from '../protocols/gmx-v2/index.js';

interface GmxOracleTicker {
  tokenAddress: string;
  minPrice: string;
  maxPrice: string;
}

export interface GmxV2DepositQuoteInput {
  publicClient: PublicClient;
  market: GmxV2Market;
  longTokenAmount: bigint;
  shortTokenAmount: bigint;
}

export interface GmxV2PricingAdapter {
  getDepositAmountOut(input: GmxV2DepositQuoteInput): Promise<bigint>;
}

function tickerFor(
  tickers: readonly GmxOracleTicker[],
  token: Address,
): GmxOracleTicker {
  const normalized = getAddress(token);
  const ticker = tickers.find(
    (candidate) => getAddress(candidate.tokenAddress) === normalized,
  );
  if (!ticker) {
    throw new Error(`GMX oracle price missing for token ${token}`);
  }
  return ticker;
}

async function fetchOracleTickers(): Promise<GmxOracleTicker[]> {
  let lastError: unknown;
  for (const url of GMX_V2_ORACLE_URLS) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`GMX oracle returned HTTP ${response.status}`);
      }
      const payload = (await response.json()) as GmxOracleTicker[];
      if (!Array.isArray(payload)) {
        throw new Error('GMX oracle returned an invalid ticker payload');
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('Failed to fetch GMX oracle prices', { cause: lastError });
}

function priceProps(ticker: GmxOracleTicker) {
  return {
    min: BigInt(ticker.minPrice),
    max: BigInt(ticker.maxPrice),
  };
}

export class GmxV2ReaderPricingAdapter implements GmxV2PricingAdapter {
  async getDepositAmountOut(input: GmxV2DepositQuoteInput): Promise<bigint> {
    const tickers = await fetchOracleTickers();
    const indexTokenPrice = priceProps(
      tickerFor(tickers, input.market.indexToken),
    );
    const longTokenPrice = priceProps(
      tickerFor(tickers, input.market.longToken),
    );
    const shortTokenPrice = priceProps(
      tickerFor(tickers, input.market.shortToken),
    );

    return input.publicClient.readContract({
      address: GMX_V2_ADDRESSES.syntheticsReader,
      abi: GMX_V2_READER_ABI,
      functionName: 'getDepositAmountOut',
      args: [
        GMX_V2_ADDRESSES.dataStore,
        {
          marketToken: input.market.marketToken,
          indexToken: input.market.indexToken,
          longToken: input.market.longToken,
          shortToken: input.market.shortToken,
        },
        { indexTokenPrice, longTokenPrice, shortTokenPrice },
        input.longTokenAmount,
        input.shortTokenAmount,
        zeroAddress,
        3,
        true,
      ],
    });
  }
}
