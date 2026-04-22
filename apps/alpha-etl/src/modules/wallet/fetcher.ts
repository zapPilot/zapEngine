import { z } from 'zod';

import { RATE_LIMITS } from '../../config/database.js';
import { BaseApiFetcher } from '../../core/fetchers/baseApiFetcher.js';
import { toErrorMessage } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';

export interface DeBankTokenBalance {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol?: string;
  optimized_symbol?: string;
  decimals: number;
  logo_url?: string;
  protocol_id?: string;
  price?: number;
  price_24h_change?: number;
  is_verified: boolean;
  is_core: boolean;
  is_wallet: boolean;
  time_at?: number;
  amount: number; // This is the balance in token units
  raw_amount?: string; // Raw balance as string
  raw_amount_hex_str?: string;
}

// Zod schema for DeBank complex protocol list validation
const ProtocolItemSchema = z.object({
  asset_dict: z.record(z.string(), z.number()),
  asset_token_list: z.array(z.unknown()),
  detail: z.record(z.string(), z.unknown()),
  detail_types: z.array(z.string()),
  name: z.string(),
  pool: z.record(z.string(), z.unknown()),
  proxy_detail: z.record(z.string(), z.unknown()).optional(),
  stats: z.object({
    asset_usd_value: z.number(),
    debt_usd_value: z.number(),
    net_usd_value: z.number(),
  }),
  update_at: z.number(),
});

const DeBankProtocolSchema = z.object({
  chain: z.string(),
  dao_id: z.string().optional(),
  has_supported_portfolio: z.boolean(),
  id: z.string(),
  is_tvl: z.boolean().nullish(),
  is_visible_in_defi: z.boolean().nullish(),
  logo_url: z.string().nullable(),
  name: z.string(),
  platform_token_id: z.string().nullish(),
  portfolio_item_list: z.array(ProtocolItemSchema),
});

export const DeBankComplexProtocolListSchema = z.array(DeBankProtocolSchema);

export type DeBankProtocolItem = z.infer<typeof ProtocolItemSchema>;
export type DeBankProtocol = z.infer<typeof DeBankProtocolSchema>;
export type DeBankComplexProtocolList = z.infer<
  typeof DeBankComplexProtocolListSchema
>;

export interface DeBankConfig {
  apiUrl?: string;
  apiKey?: string;
  rateLimitMs?: number;
  strictErrors?: boolean;
}

function resolveStrictErrors(
  configStrict: boolean | undefined,
  envStrict: string | undefined,
  defaultStrict: boolean,
): boolean {
  if (configStrict !== undefined) {
    return configStrict;
  }

  if (envStrict === undefined) {
    return defaultStrict;
  }

  return envStrict === 'true';
}

export class DeBankFetcher extends BaseApiFetcher {
  private apiKey: string | undefined;
  private strictErrors: boolean;

  constructor(config?: DeBankConfig) {
    const apiUrl =
      config?.apiUrl ??
      process.env['DEBANK_API_URL'] ??
      'https://pro-openapi.debank.com';
    const defaultRateLimit =
      process.env['NODE_ENV'] === 'test' ? 0 : RATE_LIMITS.DEBANK_DELAY_MS;
    const rateLimitMs = config?.rateLimitMs ?? defaultRateLimit; // 1 second between requests (conservative)

    super(apiUrl, rateLimitMs);

    this.apiKey = config?.apiKey ?? process.env['DEBANK_API_KEY'];
    const envStrict = process.env['DEBANK_STRICT_ERRORS'];
    const defaultStrict = process.env['NODE_ENV']
      ? process.env['NODE_ENV'] !== 'test'
      : true;
    this.strictErrors = resolveStrictErrors(
      config?.strictErrors,
      envStrict,
      defaultStrict,
    );

    if (this.apiKey) {
      logger.info('DeBank fetcher initialized with API key');
    } else {
      logger.warn(
        'DeBank fetcher initialized without API key (rate limits may apply)',
      );
    }
  }

  /**
   * Fetch wallet token balances
   */
  async fetchWalletTokenList(
    walletAddress: string,
  ): Promise<DeBankTokenBalance[]> {
    try {
      logger.info('Fetching wallet token list from API', {
        walletAddress: maskWalletAddress(walletAddress),
      });

      const url = `${this.baseUrl}/v1/user/all_token_list`;
      const params = new URLSearchParams({
        id: walletAddress.toLowerCase(),
      });

      const data = await this.fetchWithRetry<unknown>(
        `${url}?${params}`,
        {
          headers: this.buildHeaders(),
        },
        3,
        1000,
      );
      return this.validateTokenResponse(data, walletAddress);
    } catch (error) {
      this.logFetchError(
        'Failed to fetch wallet token list',
        walletAddress,
        error,
      );
      return this.rethrowOrReturnEmpty<DeBankTokenBalance>(error);
    }
  }

  private validateTokenResponse(
    data: unknown,
    walletAddress: string,
  ): DeBankTokenBalance[] {
    if (Array.isArray(data)) {
      return data as DeBankTokenBalance[];
    }

    logger.warn('API returned non-array response', {
      walletAddress: maskWalletAddress(walletAddress),
      responseType: typeof data,
      response: data,
    });
    if (this.strictErrors) {
      throw new Error('DeBank API returned non-array response for token list');
    }
    return [];
  }

  /**
   * Fetch complex protocol list (portfolio items) for a wallet
   */
  async fetchComplexProtocolList(
    walletAddress: string,
  ): Promise<DeBankComplexProtocolList> {
    try {
      logger.info('Fetching complex protocol list from DeBank API', {
        walletAddress: maskWalletAddress(walletAddress),
      });

      const url = `${this.baseUrl}/v1/user/all_complex_protocol_list`;
      const params = new URLSearchParams({
        id: walletAddress.toLowerCase(),
      });

      const data = await this.fetchWithRetry<unknown>(
        `${url}?${params}`,
        {
          headers: this.buildHeaders(),
        },
        3,
        1000,
      );
      return this.validateProtocolResponse(data, walletAddress);
    } catch (error) {
      this.logFetchError(
        'Failed to fetch complex protocol list from DeBank',
        walletAddress,
        error,
      );
      return this.rethrowOrReturnEmpty<DeBankProtocol>(error);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['AccessKey'] = this.apiKey;
    }
    return headers;
  }

  private validateProtocolResponse(
    data: unknown,
    walletAddress: string,
  ): DeBankComplexProtocolList {
    if (!Array.isArray(data)) {
      logger.warn(
        'DeBank API returned non-array response for complex protocol list',
        {
          walletAddress: maskWalletAddress(walletAddress),
          responseType: typeof data,
        },
      );
      if (this.strictErrors) {
        throw new Error(
          'DeBank API returned non-array response for complex protocol list',
        );
      }
      return [];
    }

    try {
      return DeBankComplexProtocolListSchema.parse(data);
    } catch (zodError) {
      logger.warn(
        'DeBank complex protocol list validation failed, returning raw data',
        {
          walletAddress: maskWalletAddress(walletAddress),
          error:
            zodError instanceof Error
              ? zodError.message
              : 'Unknown validation error',
        },
      );
      return data as DeBankComplexProtocolList;
    }
  }

  private logFetchError(
    message: string,
    walletAddress: string,
    error: unknown,
  ): void {
    logger.error(message, {
      walletAddress: maskWalletAddress(walletAddress),
      error,
    });
  }

  private rethrowOrReturnEmpty<T>(error: unknown): T[] {
    if (this.strictErrors) {
      throw new Error(`DeBank API error: ${toErrorMessage(error)}`);
    }
    return [];
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      // Test with a well-known address (Ethereum Foundation)
      const testAddress = '0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae';
      const url = `${this.baseUrl}/v1/user/total_balance`;
      const params = new URLSearchParams({
        id: testAddress,
      });

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      };

      Object.assign(headers, this.buildHeaders());

      const response = await fetch(`${url}?${params}`, {
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        return { status: 'healthy' };
      } else if (response.status === 429) {
        return {
          status: 'unhealthy',
          details: 'Rate limited - consider adding API key',
        };
      } else {
        return {
          status: 'unhealthy',
          details: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    });
  }
}
