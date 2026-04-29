import { BaseApiFetcher } from '../../core/fetchers/baseApiFetcher.js';
import { APIError } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import {
  type CnnFearGreedPayload,
  type MacroFearGreedData,
  parseCnnFearGreedHistory,
  parseCurrentCnnFearGreed,
} from './schema.js';

interface MacroFearGreedFetcherConfig {
  apiUrl?: string;
}

export class MacroFearGreedFetcher extends BaseApiFetcher {
  private static readonly BASE_URL = 'https://production.dataviz.cnn.io';
  private static readonly ENDPOINT = '/index/fearandgreed/graphdata';
  private static readonly RATE_LIMIT_MS =
    process.env['NODE_ENV'] === 'test' ? 0 : 60_000;

  constructor(config?: MacroFearGreedFetcherConfig) {
    super(
      config?.apiUrl ?? MacroFearGreedFetcher.BASE_URL,
      MacroFearGreedFetcher.RATE_LIMIT_MS,
    );
  }

  async fetchCurrent(): Promise<MacroFearGreedData> {
    const payload = await this.fetchRawResponse();
    const data = parseCurrentCnnFearGreed(payload);
    logger.info('Successfully fetched CNN macro Fear & Greed', {
      score: data.score,
      label: data.label,
      updatedAt: data.updatedAt,
    });
    return data;
  }

  async fetchHistory(startDate = '2021-01-01'): Promise<MacroFearGreedData[]> {
    const payload = await this.fetchRawResponse(startDate);
    return parseCnnFearGreedHistory(payload);
  }

  async fetchRawResponse(startDate?: string): Promise<CnnFearGreedPayload> {
    const suffix = startDate ? `/${encodeURIComponent(startDate)}` : '';
    const url = `${this.baseUrl}${MacroFearGreedFetcher.ENDPOINT}${suffix}`;
    try {
      return await this.fetchWithRetry<CnnFearGreedPayload>(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; ZapPilot/1.0; +https://zappilot.ai)',
            Accept: 'application/json',
          },
        },
        3,
        1000,
      );
    } catch (error) {
      if (error instanceof APIError) {
        logger.error('CNN macro Fear & Greed request failed', {
          error: error.message,
          statusCode: error.statusCode,
        });
        throw new Error(`CNN macro Fear & Greed API error: ${error.message}`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      const data = await this.fetchCurrent();
      const updatedAt = new Date(data.updatedAt).getTime();
      const ageHours = Math.floor((Date.now() - updatedAt) / (60 * 60 * 1000));
      if (ageHours > 72) {
        return {
          status: 'unhealthy',
          details: `CNN macro Fear & Greed data is stale (${ageHours} hours old)`,
        };
      }
      return {
        status: 'healthy',
        details: `CNN macro Fear & Greed: ${data.normalizedScore} (${data.label})`,
      };
    });
  }
}
