import { equalsAddress } from '@zapengine/types/shared';
import { getAddress, zeroAddress, type Address, type PublicClient } from 'viem';

import { GmxDepositTooSmallError } from '../errors/intent.errors.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_ORACLE_URLS,
  GMX_V2_READER_ABI,
  type GmxV2FundedSide,
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
  /** The token the deposit is funded with — WETH for native ETH. */
  initialToken: Address;
  amount: bigint;
  side: GmxV2FundedSide;
  /** Markets the keeper swaps `initialToken` through before minting. */
  swapPath: readonly GmxV2Market[];
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

function readerMarket(market: GmxV2Market) {
  return {
    marketToken: market.marketToken,
    indexToken: market.indexToken,
    longToken: market.longToken,
    shortToken: market.shortToken,
  };
}

function readerPrices(
  tickers: readonly GmxOracleTicker[],
  market: GmxV2Market,
) {
  return {
    indexTokenPrice: priceProps(tickerFor(tickers, market.indexToken)),
    longTokenPrice: priceProps(tickerFor(tickers, market.longToken)),
    shortTokenPrice: priceProps(tickerFor(tickers, market.shortToken)),
  };
}

export class GmxV2ReaderPricingAdapter implements GmxV2PricingAdapter {
  async getDepositAmountOut(input: GmxV2DepositQuoteInput): Promise<bigint> {
    const tickers = await fetchOracleTickers();

    // Hop by hop, as the keeper executes it: each output funds the next hop.
    let token = input.initialToken;
    let amount = input.amount;
    for (const hop of input.swapPath) {
      const [amountOut] = await input.publicClient.readContract({
        address: GMX_V2_ADDRESSES.syntheticsReader,
        abi: GMX_V2_READER_ABI,
        functionName: 'getSwapAmountOut',
        args: [
          GMX_V2_ADDRESSES.dataStore,
          readerMarket(hop),
          readerPrices(tickers, hop),
          token,
          amount,
          zeroAddress,
        ],
      });
      if (amountOut <= 0n) {
        throw new GmxDepositTooSmallError(
          `GMX deposit amount rounds to zero when swapped through ${hop.name}`,
        );
      }
      token = equalsAddress(token, hop.longToken)
        ? hop.shortToken
        : hop.longToken;
      amount = amountOut;
    }

    return input.publicClient.readContract({
      address: GMX_V2_ADDRESSES.syntheticsReader,
      abi: GMX_V2_READER_ABI,
      functionName: 'getDepositAmountOut',
      args: [
        GMX_V2_ADDRESSES.dataStore,
        readerMarket(input.market),
        readerPrices(tickers, input.market),
        input.side === 'long' ? amount : 0n,
        input.side === 'short' ? amount : 0n,
        zeroAddress,
        3,
        true,
      ],
    });
  }
}
