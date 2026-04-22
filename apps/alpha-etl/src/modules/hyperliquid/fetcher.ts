import { z } from 'zod';

import { RATE_LIMITS, TIMEOUTS } from '../../config/database.js';
import { env } from '../../config/environment.js';
import {
  BaseApiFetcher,
  type FetchOptions,
} from '../../core/fetchers/baseApiFetcher.js';
import { APIError, toErrorMessage } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import {
  createVaultRequestId,
  deriveTvlFromPortfolio,
  FollowerStateSchema,
  parseVaultDetailsResponse,
  resolveTotalFollowers,
  resolveVaultValue,
  type VaultDetailsResponse,
  VaultDetailsResponseSchema,
  VaultRelationshipSchema,
} from './fetcher.helpers.js';

export {
  FollowerStateSchema,
  type VaultDetailsResponse,
  VaultDetailsResponseSchema,
  VaultRelationshipSchema,
};

export interface VaultPositionData {
  userWallet: string;
  vaultAddress: string;
  vaultName: string;
  hlpBalance: number;
  vaultUsdValue: number;
  maxWithdrawable: number | null;
  relationshipType: 'parent' | 'follower' | null;
  leaderAddress?: string | null;
  vaultDescription?: string | null;
}

export interface VaultAprData {
  vaultAddress: string;
  vaultName: string;
  leaderAddress: string;
  apr: number;
  tvlUsd: number | null;
  leaderCommission?: number | null;
  leaderFraction?: number | null;
  totalFollowers?: number | null;
  isClosed: boolean;
  allowDeposits: boolean;
}

function extractPositionData(
  vaultDetails: VaultDetailsResponse,
  userWallet: string,
): VaultPositionData | null {
  const followerState = vaultDetails.followerState;

  if (!followerState) {
    logger.warn('No follower state in vault details', {
      userWallet,
      vaultAddress: vaultDetails.vaultAddress,
    });
    return null;
  }

  const vaultValue = resolveVaultValue(followerState);
  if (vaultValue === null) {
    logger.warn('Hyperliquid follower state missing usable balance', {
      userWallet,
      vaultAddress: vaultDetails.vaultAddress,
    });
    return null;
  }

  const maxWithdrawable =
    followerState.maxWithdrawable ?? vaultDetails.maxWithdrawable ?? null;

  return {
    userWallet,
    vaultAddress: vaultDetails.vaultAddress,
    vaultName: vaultDetails.name || 'Hyperliquid Vault',
    hlpBalance: vaultValue,
    vaultUsdValue: vaultValue,
    maxWithdrawable,
    relationshipType: vaultDetails.relationship?.type || null,
    leaderAddress: vaultDetails.leader,
    vaultDescription: vaultDetails.description ?? null,
  };
}

function extractAprData(vaultDetails: VaultDetailsResponse): VaultAprData {
  const tvlFallback = deriveTvlFromPortfolio(vaultDetails.portfolio);
  const tvlUsd = vaultDetails.totalVlm ?? tvlFallback ?? null;
  const totalFollowers = resolveTotalFollowers(vaultDetails);

  return {
    vaultAddress: vaultDetails.vaultAddress,
    vaultName: vaultDetails.name || 'Hyperliquid Vault',
    leaderAddress: vaultDetails.leader,
    apr: vaultDetails.apr,
    tvlUsd,
    leaderCommission: vaultDetails.leaderCommission ?? null,
    leaderFraction: vaultDetails.leaderFraction ?? null,
    totalFollowers,
    isClosed: vaultDetails.isClosed ?? false,
    allowDeposits: vaultDetails.allowDeposits !== false,
  };
}

export interface HyperliquidConfig {
  baseUrl?: string;
  rateLimitRpm?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class HyperliquidFetcher extends BaseApiFetcher {
  private readonly config: Required<HyperliquidConfig>;
  private readonly defaultVaultAddress =
    '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
  private readonly infoEndpoint: string;

  constructor(config?: HyperliquidConfig) {
    const baseUrl =
      config?.baseUrl ??
      env.HYPERLIQUID_API_URL ??
      'https://api-ui.hyperliquid.xyz';
    const rateLimitRpm =
      config?.rateLimitRpm ?? env.HYPERLIQUID_RATE_LIMIT_RPM ?? 60;
    const rateLimitDelayMs = Math.ceil(
      RATE_LIMITS.MS_PER_MINUTE / rateLimitRpm,
    );

    super(baseUrl, rateLimitDelayMs);

    this.config = {
      baseUrl,
      rateLimitRpm,
      timeout: config?.timeout || TIMEOUTS.API_REQUEST_MS,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs || 1000,
    };
    this.infoEndpoint = `${this.config.baseUrl}/info`;

    logger.info('HyperliquidFetcher initialized', {
      baseUrl: this.config.baseUrl,
      rateLimitRpm: this.config.rateLimitRpm,
      rateLimitDelayMs,
    });
  }

  async getVaultDetails(
    userWallet: string,
    vaultAddress: string = this.defaultVaultAddress,
  ): Promise<VaultDetailsResponse> {
    const requestId = createVaultRequestId();

    logger.debug('Fetching Hyperliquid vault details', {
      requestId,
      userWallet,
      vaultAddress,
    });

    try {
      const response = await this.fetchWithRetryAndBackoff(this.infoEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://app.hyperliquid.xyz',
        },
        body: JSON.stringify({
          type: 'vaultDetails',
          user: userWallet,
          vaultAddress,
        }),
        timeout: this.config.timeout,
      });

      const validatedData = parseVaultDetailsResponse(await response.json());

      logger.info('Successfully fetched vault details', {
        requestId,
        userWallet,
        vaultAddress,
        apr: validatedData.apr,
        tvl: validatedData.totalVlm,
      });

      return validatedData;
    } catch (error) {
      logger.error('Failed to fetch Hyperliquid vault details', {
        requestId,
        userWallet,
        vaultAddress,
        error: toErrorMessage(error),
      });

      if (error instanceof z.ZodError) {
        throw new APIError(
          `Invalid response from Hyperliquid API: ${error.message}`,
          500,
          this.infoEndpoint,
          'HyperliquidFetcher',
        );
      }

      throw error;
    }
  }

  async getVaultDetailsForUsers(
    userWallets: string[],
    vaultAddress: string = this.defaultVaultAddress,
  ): Promise<VaultDetailsResponse[]> {
    logger.info('Batch fetching vault details', {
      userCount: userWallets.length,
      vaultAddress,
    });

    const results: VaultDetailsResponse[] = [];
    const errors: { wallet: string; error: string }[] = [];

    for (const wallet of userWallets) {
      try {
        const vaultData = await this.getVaultDetails(wallet, vaultAddress);
        results.push(vaultData);
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        logger.error('Failed to fetch vault details for user', {
          wallet,
          error: errorMessage,
        });
        errors.push({ wallet, error: errorMessage });
      }
    }

    logger.info('Batch fetch completed', {
      totalUsers: userWallets.length,
      successful: results.length,
      failed: errors.length,
    });

    if (errors.length > 0 && results.length === 0) {
      throw new APIError(
        `All vault detail fetches failed for ${userWallets.length} users`,
        500,
        this.infoEndpoint,
        'HyperliquidFetcher',
      );
    }

    return results;
  }

  extractPositionData(
    vaultDetails: VaultDetailsResponse,
    userWallet: string,
  ): VaultPositionData | null {
    return extractPositionData(vaultDetails, userWallet);
  }

  extractAprData(vaultDetails: VaultDetailsResponse): VaultAprData {
    return extractAprData(vaultDetails);
  }

  private async fetchWithRetryAndBackoff(
    url: string,
    options: FetchOptions,
  ): Promise<Response> {
    return withRetry(() => this.fetchWithRateLimit(url, options), {
      maxAttempts: this.config.maxRetries,
      baseDelayMs: this.config.retryDelayMs,
      label: `Hyperliquid API ${url}`,
    });
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      const testWallet = '0x0000000000000000000000000000000000000001';
      await this.getVaultDetails(testWallet, this.defaultVaultAddress);
      return { status: 'healthy' };
    });
  }

  getDefaultVaultAddress(): string {
    return this.defaultVaultAddress;
  }
}
