/**
 * CoinGecko API Fetcher
 *
 * Fetches token price data (BTC, ETH, SOL, etc.) from CoinGecko's public API
 * Rate limited to respect free tier (30-50 calls/min)
 *
 * Data Source: CoinGecko API (simple/price, coins/history)
 */

import { RATE_LIMITS } from "../../config/database.js";
import { APIError } from "../../utils/errors.js";
import { wrapHealthCheck } from "../../utils/healthCheck.js";
import { logger } from "../../utils/logger.js";
import { BaseApiFetcher } from "../../core/fetchers/baseApiFetcher.js";
import {
  CoinGeckoHistoricalSchema,
  CoinGeckoSimplePriceSchema,
  type CoinGeckoHistoricalResponse,
  type CoinGeckoSimplePriceResponse,
  type TokenPriceData,
} from "../../modules/token-price/schema.js";

export type { TokenPriceData } from "../../modules/token-price/schema.js";

interface CoinGeckoFetcherConfig {
  baseUrl?: string;
  rateLimitMs?: number;
}

export class CoinGeckoFetcher extends BaseApiFetcher {
  private static readonly DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3";
  private static readonly SOURCE_NAME = "coingecko";
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  constructor(config?: CoinGeckoFetcherConfig) {
    const baseUrl =
      config?.baseUrl ??
      process.env.COINGECKO_API_URL ??
      CoinGeckoFetcher.DEFAULT_BASE_URL;
    /* v8 ignore start -- production rate limit path not reachable in test env */
    const defaultRateLimit =
      process.env.NODE_ENV === "test"
        ? 0
        : RATE_LIMITS.COINGECKO_DELAY_MS || 2000;
    /* v8 ignore stop */
    const rateLimitMs = config?.rateLimitMs ?? defaultRateLimit;
    super(baseUrl, rateLimitMs);
  }

  async fetchCurrentPrice(
    tokenId: string = "bitcoin",
    tokenSymbol: string = "BTC",
  ): Promise<TokenPriceData> {
    const endpoint = this.buildCurrentPriceEndpoint(tokenId);

    try {
      logger.info("Fetching current token price from CoinGecko", {
        tokenId,
        tokenSymbol,
        endpoint,
      });

      const response =
        await this.fetchCoinGecko<CoinGeckoSimplePriceResponse>(endpoint);
      const priceData = this.parseCurrentPriceResponse(
        response,
        tokenId,
        tokenSymbol,
      );

      logger.info("Successfully fetched current token price", {
        tokenId,
        tokenSymbol,
        price: priceData.priceUsd,
        marketCap: priceData.marketCapUsd,
        volume: priceData.volume24hUsd,
      });

      return priceData;
    } catch (error) {
      return this.handleFetchError(error, {
        tokenId,
        tokenSymbol,
        endpoint,
        date: undefined,
        operation: "current",
      });
    }
  }

  async fetchHistoricalPrice(
    date: string,
    tokenId: string = "bitcoin",
    tokenSymbol: string = "BTC",
  ): Promise<TokenPriceData> {
    const endpoint = this.buildHistoricalPriceEndpoint(tokenId, date);

    try {
      logger.info("Fetching historical token price", {
        date,
        tokenId,
        tokenSymbol,
        endpoint,
      });

      const response =
        await this.fetchCoinGecko<CoinGeckoHistoricalResponse>(endpoint);
      const priceData = this.parseHistoricalPriceResponse(
        response,
        tokenId,
        tokenSymbol,
        date,
      );

      logger.info("Successfully fetched historical token price", {
        date,
        tokenId,
        tokenSymbol,
        price: priceData.priceUsd,
        marketCap: priceData.marketCapUsd,
      });

      return priceData;
    } catch (error) {
      return this.handleFetchError(error, {
        tokenId,
        tokenSymbol,
        endpoint,
        date,
        operation: "historical",
      });
    }
  }

  private buildCurrentPriceEndpoint(tokenId: string): string {
    return `${this.baseUrl}/simple/price?ids=${tokenId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;
  }

  private buildHistoricalPriceEndpoint(tokenId: string, date: string): string {
    return `${this.baseUrl}/coins/${tokenId}/history?date=${date}`;
  }

  private async fetchCoinGecko<T>(endpoint: string): Promise<T> {
    return this.fetchWithRetry<T>(
      endpoint,
      {},
      CoinGeckoFetcher.RETRY_ATTEMPTS,
      CoinGeckoFetcher.RETRY_DELAY_MS,
    );
  }

  private parseCurrentPriceResponse(
    response: CoinGeckoSimplePriceResponse,
    tokenId: string,
    tokenSymbol: string,
  ): TokenPriceData {
    const parsed = CoinGeckoSimplePriceSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error("Invalid CoinGecko response");
    }

    const tokenData = response[tokenId];
    if (!tokenData?.usd) {
      throw new Error(
        `Invalid CoinGecko response: missing ${tokenId}.usd field`,
      );
    }

    return {
      priceUsd: tokenData.usd,
      marketCapUsd: tokenData.usd_market_cap ?? 0,
      volume24hUsd: tokenData.usd_24h_vol ?? 0,
      timestamp: new Date(),
      source: CoinGeckoFetcher.SOURCE_NAME,
      tokenSymbol,
      tokenId,
    };
  }

  private parseHistoricalPriceResponse(
    response: CoinGeckoHistoricalResponse,
    tokenId: string,
    tokenSymbol: string,
    date: string,
  ): TokenPriceData {
    const parsed = CoinGeckoHistoricalSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error(
        `Invalid CoinGecko historical response for ${tokenId} on ${date}: missing market_data.current_price.usd`,
      );
    }

    return {
      priceUsd: response.market_data.current_price.usd,
      marketCapUsd: response.market_data.market_cap?.usd ?? 0,
      volume24hUsd: response.market_data.total_volume?.usd ?? 0,
      timestamp: this.parseDate(date),
      source: CoinGeckoFetcher.SOURCE_NAME,
      tokenSymbol,
      tokenId,
    };
  }

  private parseDate(ddMmYyyy: string): Date {
    const [day, month, year] = ddMmYyyy.split("-");
    return new Date(
      Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        0,
        0,
        0,
        0,
      ),
    );
  }

  formatDateForApi(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  async healthCheck(
    tokenId: string = "bitcoin",
    tokenSymbol: string = "BTC",
  ): Promise<{ status: "healthy" | "unhealthy"; details?: string }> {
    return wrapHealthCheck(async () => {
      const priceData = await this.fetchCurrentPrice(tokenId, tokenSymbol);

      if (priceData.priceUsd < 1000 || priceData.priceUsd > 1000000) {
        return {
          status: "unhealthy",
          details: `${tokenSymbol} price ${priceData.priceUsd} seems unrealistic`,
        };
      }

      return {
        status: "healthy",
        details: `Current ${tokenSymbol} price: $${priceData.priceUsd.toLocaleString()}`,
      };
    });
  }

  private handleFetchError(
    error: unknown,
    context: {
      tokenId: string;
      tokenSymbol: string;
      endpoint: string;
      date?: string;
      operation: "current" | "historical";
    },
  ): never {
    const isHistorical = context.operation === "historical";
    const logContext = {
      ...(isHistorical && context.date ? { date: context.date } : {}),
      tokenId: context.tokenId,
      tokenSymbol: context.tokenSymbol,
      endpoint: context.endpoint,
    };

    if (error instanceof APIError) {
      logger.error(
        isHistorical
          ? "CoinGecko historical API request failed"
          : "CoinGecko API request failed",
        { error: error.message, statusCode: error.statusCode, ...logContext },
      );
      const message =
        isHistorical && context.date
          ? `CoinGecko API error for ${context.tokenId} on ${context.date}: ${error.message}`
          : `CoinGecko API error: ${error.message}`;
      throw new Error(message);
    }

    logger.error(
      isHistorical
        ? "Failed to fetch historical token price"
        : "Failed to fetch current token price",
      { error, ...logContext },
    );
    throw error;
  }
}
