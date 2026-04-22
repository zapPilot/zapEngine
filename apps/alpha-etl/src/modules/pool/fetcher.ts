import { RATE_LIMITS } from '../../config/database.js';
import { env } from '../../config/environment.js';
import {
  BaseApiFetcher,
  type FetchOptions,
} from '../../core/fetchers/baseApiFetcher.js';
import { DeFiLlamaResponseSchema } from '../../modules/pool/schema.js';
import type { PoolData } from '../../types/index.js';
import { APIError } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import {
  checkSymbolListsEqual,
  cleanRewardTokens,
  mapChainName,
  normalizeSymbolList,
} from '../../utils/symbolUtils.js';

export interface DeFiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  underlyingTokens?: string[];
  tvlUsd: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
  apyPct1D?: number;
  apyPct7D?: number;
  apyPct30D?: number;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta?: string;
  mu?: number;
  sigma?: number;
  count?: number;
  outlier?: boolean;
  url?: string;
  rewardTokens?: string[];
  volumeUsd1d?: number;
}
export interface DeFiLlamaResponse {
  status: string;
  data: DeFiLlamaPool[];
}
function resolveBaseUrl(rawBaseUrl: string): string {
  const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, '');
  if (normalizedBaseUrl === 'https://api.llama.fi') {
    return 'https://yields.llama.fi';
  }
  return normalizedBaseUrl;
}
/* v8 ignore start -- production rate limit path not reachable in test env */
function resolveRateLimitMs(): number {
  return process.env['NODE_ENV'] === 'test'
    ? 0
    : RATE_LIMITS.DEFILLAMA_DELAY_MS;
}
/* v8 ignore stop */
export class DeFiLlamaFetcher extends BaseApiFetcher {
  constructor() {
    const rawBaseUrl = env.DEFILLAMA_API_URL || 'https://api.llama.fi';
    const baseUrl = resolveBaseUrl(rawBaseUrl);
    const rateLimitMs = resolveRateLimitMs();
    super(baseUrl, rateLimitMs);
  }
  protected async fetchDeFiLlamaJson<T>(
    url: string,
    options: FetchOptions = {},
  ): Promise<T> {
    try {
      return await this.fetchWithRetry<T>(url, options, 3, 1000);
    } catch (error) {
      if (error instanceof APIError) {
        // Re-throw with DeFiLlama-specific context for test compatibility
        throw new Error(`DeFiLlama API error: ${error.message}`);
      }
      throw error;
    }
  }
  async fetchAllPools(tvlThreshold = 0): Promise<PoolData[]> {
    try {
      const url = `${this.baseUrl}/pools`;
      logger.info('Fetching pools from DeFiLlama', { url, tvlThreshold });
      const rawData = await this.fetchDeFiLlamaJson<unknown>(url);
      const data = this.parseDeFiLlamaResponse(rawData, url);
      if (data.status !== 'success') {
        throw new Error(
          `DeFiLlama API returned non-success status: ${data.status}`,
        );
      }
      const filteredPools = this.filterPoolsByTvl(data.data, tvlThreshold);
      logger.info('Filtered pools by TVL', {
        originalCount: data.data.length,
        filteredCount: filteredPools.length,
        tvlThreshold,
      });
      return this.transformPools(filteredPools);
    } catch (error) {
      logger.error('Failed to fetch DeFiLlama pools:', error);
      throw error;
    }
  }
  async fetchPoolsByChain(
    chain: string,
    tvlThreshold = 0,
  ): Promise<PoolData[]> {
    const allPools = await this.fetchAllPools(tvlThreshold);
    const mappedChain = mapChainName(chain);
    return allPools.filter(
      (pool) => pool.chain.toLowerCase() === mappedChain.toLowerCase(),
    );
  }
  async findMatchingPool(
    chain: string,
    projectId: string,
    version: string,
    symbolList: string[],
  ): Promise<PoolData | null> {
    try {
      const pools = await this.fetchAllPools(0); // No TVL filtering for pool matching
      const mappedChain = mapChainName(chain);
      const normalizedSymbols = normalizeSymbolList(symbolList);
      const matchedPool = this.findFirstMatchingPool(
        pools,
        mappedChain,
        projectId,
        version,
        normalizedSymbols,
      );
      if (matchedPool) {
        logger.info('Found matching DeFiLlama pool', {
          poolAddress: matchedPool.pool_address,
          protocolAddress: matchedPool.protocol_address,
          chain: matchedPool.chain,
          protocol: matchedPool.protocol,
          symbols: symbolList,
        });
        return matchedPool;
      }
      logger.warn('No matching DeFiLlama pool found', {
        chain: mappedChain,
        projectId,
        symbols: symbolList,
      });
      return null;
    } catch (error) {
      logger.error('Error finding matching DeFiLlama pool:', error);
      return null;
    }
  }
  private transformPools(pools: DeFiLlamaPool[]): PoolData[] {
    return pools
      .map((pool) => this.transformPool(pool))
      .filter((pool): pool is PoolData => pool !== null);
  }
  private transformPool(pool: DeFiLlamaPool): PoolData | null {
    try {
      const normalizedChain = pool.chain.toLowerCase();
      const normalizedProtocol = pool.project.toLowerCase();
      const normalizedSymbol = (pool.symbol || 'unknown').toLowerCase();
      // Filter out pools with empty chain values
      if (!normalizedChain) {
        logger.warn('Skipping pool with empty chain', { poolId: pool.pool });
        return null;
      }
      const poolData: PoolData = {
        pool_address: null, // DeFiLlama uses internal UUIDs, not real addresses
        protocol_address: null, // DeFiLlama doesn't provide protocol addresses
        chain: normalizedChain,
        protocol: normalizedProtocol,
        symbol: normalizedSymbol,
        underlying_tokens: pool.underlyingTokens || null,
        tvl_usd: pool.tvlUsd || null,
        apy: pool.apy || 0,
        apy_base: pool.apyBase || null,
        apy_reward: pool.apyReward || null,
        volume_usd_1d: pool.volumeUsd1d || null,
        exposure: this.mapExposure(pool.exposure),
        reward_tokens: cleanRewardTokens(pool.rewardTokens),
        pool_meta: this.buildPoolMeta(pool),
        source: 'defillama',
        raw_data: this.buildRawData(pool),
      };
      return poolData;
    } catch (error) {
      logger.error('Failed to transform DeFiLlama pool:', {
        poolId: pool.pool,
        error,
      });
      return null;
    }
  }
  private buildPoolMeta(pool: DeFiLlamaPool): Record<string, unknown> | null {
    return pool.poolMeta ? { poolMeta: pool.poolMeta, url: pool.url } : null;
  }
  private buildRawData(pool: DeFiLlamaPool): Record<string, unknown> {
    return {
      defillama_pool_id: pool.pool,
      original_pool: pool,
      underlying_tokens: pool.underlyingTokens,
      outlier: pool.outlier,
      count: pool.count,
      mu: pool.mu,
      sigma: pool.sigma,
      stablecoin: pool.stablecoin,
      il_risk: pool.ilRisk,
    };
  }
  private matchesChain(pool: PoolData, targetChain: string): boolean {
    return pool.chain.toLowerCase() === targetChain.toLowerCase();
  }
  private matchesProject(
    pool: PoolData,
    projectId: string,
    version: string,
  ): boolean {
    const poolProject = pool.protocol.toLowerCase();
    const targetProject = projectId.toLowerCase();
    const normalizedVersion = version.toLowerCase();
    const doesProjectMatch = poolProject.includes(targetProject);
    const doesVersionMatch =
      version === '0' || poolProject.includes(normalizedVersion);
    return doesProjectMatch && doesVersionMatch;
  }
  private matchesSymbols(pool: PoolData, targetSymbols: string[]): boolean {
    if (!pool.symbol) {
      return false;
    }
    const poolSymbols = pool.symbol.split('-');
    // Check both strict and non-strict symbol matching
    return (
      checkSymbolListsEqual(poolSymbols, targetSymbols, true) ||
      checkSymbolListsEqual(poolSymbols, targetSymbols, false)
    );
  }
  private mapExposure(exposure: string): string {
    const validExposures = ['single', 'multi', 'stable'];
    const normalized = exposure?.toLowerCase();
    return validExposures.includes(normalized) ? normalized : 'multi';
  }
  private parseDeFiLlamaResponse(
    rawData: unknown,
    url: string,
  ): DeFiLlamaResponse {
    const parsed = DeFiLlamaResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      logger.error('Invalid DeFiLlama response', {
        error: parsed.error.message,
        url,
      });
      throw new Error('Invalid DeFiLlama response');
    }
    return parsed.data as DeFiLlamaResponse;
  }
  private findFirstMatchingPool(
    pools: PoolData[],
    mappedChain: string,
    projectId: string,
    version: string,
    normalizedSymbols: string[],
  ): PoolData | null {
    for (const pool of pools) {
      if (!this.matchesChain(pool, mappedChain)) {
        continue;
      }
      if (!this.matchesProject(pool, projectId, version)) {
        continue;
      }
      if (!this.matchesSymbols(pool, normalizedSymbols)) {
        continue;
      }
      return pool;
    }
    return null;
  }
  private filterPoolsByTvl(
    pools: DeFiLlamaPool[],
    tvlThreshold: number,
  ): DeFiLlamaPool[] {
    return pools.filter((pool) => pool.tvlUsd > tvlThreshold);
  }
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      // Test with a minimal request
      await this.fetchPoolsByChain('ethereum', 0);
      return { status: 'healthy' };
    });
  }
}
