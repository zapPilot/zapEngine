import { z } from 'zod';

import { RATE_LIMITS } from '../../config/constants.js';
import { env } from '../../config/environment.js';
import { BaseApiFetcher } from '../../core/fetchers/baseApiFetcher.js';
import {
  buildCoinMarketCapHeaders,
  resolveCoinMarketCapKey,
} from '../../core/fetchers/coinMarketCap.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import type { TokenPriceData } from './schema.js';

const quotesSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      quote: z.object({
        USD: z.object({
          price: z.number().positive(),
          market_cap: z.number().nonnegative(),
          volume_24h: z.number().nonnegative(),
        }),
      }),
    }),
  ),
});

interface PriceToken {
  tokenId: string;
  tokenSymbol: string;
  coinMarketCapId: number;
}

export class CoinMarketCapPriceFetcher extends BaseApiFetcher {
  private readonly apiKey: string;

  constructor(config?: { apiKey?: string; apiUrl?: string }) {
    super(
      config?.apiUrl ?? env.COINMARKETCAP_API_URL,
      CoinMarketCapPriceFetcher.resolveRateLimitDelay(
        RATE_LIMITS.COINMARKETCAP_DELAY_MS,
      ),
    );
    this.apiKey = resolveCoinMarketCapKey(
      'CoinMarketCapPriceFetcher',
      config?.apiKey,
    );
  }

  async fetchCurrentPrices(
    tokens: readonly PriceToken[],
  ): Promise<TokenPriceData[]> {
    if (!this.apiKey) throw new Error('CoinMarketCap API key not configured');
    const ids = tokens.map((token) => token.coinMarketCapId).join(',');
    const response = await this.fetchWithRetry<unknown>(
      `${this.baseUrl}/v2/cryptocurrency/quotes/latest?id=${ids}&convert=USD`,
      { headers: buildCoinMarketCapHeaders(this.apiKey) },
      3,
      1000,
    );
    const parsed = quotesSchema.parse(response);
    const timestamp = new Date();
    return tokens.map((token) => {
      const quote = parsed.data[String(token.coinMarketCapId)]?.quote.USD;
      if (!quote)
        throw new Error(
          `Invalid CoinMarketCap response: missing ${token.coinMarketCapId} quote`,
        );
      return {
        tokenId: token.tokenId,
        tokenSymbol: token.tokenSymbol,
        priceUsd: quote.price,
        marketCapUsd: quote.market_cap,
        volume24hUsd: quote.volume_24h,
        timestamp,
        source: 'coinmarketcap',
      };
    });
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      await this.fetchCurrentPrices([
        { tokenId: 'bitcoin', tokenSymbol: 'BTC', coinMarketCapId: 1 },
      ]);
      return { status: 'healthy' };
    });
  }
}
