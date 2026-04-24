#!/usr/bin/env tsx

/**
 * Test script to validate DeFiLlama fixture data
 * This script loads the yield-llama-fixtures.json file and tests:
 * 1. Data transformation without errors
 * 2. Validation schema compliance
 * 3. Database insertion capability
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PoolDataTransformer } from '../src/modules/pool/transformer.js';
import { PoolWriter } from '../src/modules/pool/writer.js';
import { toErrorMessage } from '../src/utils/errors.js';
import { logger } from '../src/utils/logger.js';

interface FixtureResponse {
  status: string;
  data: FixturePool[];
}

interface FixturePool {
  pool: string;
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number | null;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  volumeUsd1d?: number | null;
  exposure?: string;
  rewardTokens?: string[];
  poolMeta?: unknown;
  url?: string;
  underlyingTokens?: unknown;
  outlier?: unknown;
  count?: unknown;
  mu?: unknown;
  sigma?: unknown;
  stablecoin?: unknown;
  ilRisk?: unknown;
}

interface FixturePoolData {
  pool_address: null;
  protocol_address: null;
  chain: string;
  protocol: string;
  symbol: string;
  tvl_usd: number | null;
  apy: number;
  apy_base: number | null;
  apy_reward: number | null;
  volume_usd_1d: number | null;
  exposure: string | null;
  reward_tokens: string[] | null;
  pool_meta: { poolMeta: unknown; url: string | undefined } | null;
  source: 'defillama';
  raw_data: {
    defillama_pool_id: string;
    original_pool: FixturePool;
    underlying_tokens: unknown;
    outlier: unknown;
    count: unknown;
    mu: unknown;
    sigma: unknown;
    stablecoin: unknown;
    il_risk: unknown;
  };
}

function createFixturePoolData(pool: FixturePool): FixturePoolData {
  return {
    pool_address: null,
    protocol_address: null,
    chain: pool.chain?.toLowerCase() ?? 'unknown',
    protocol: pool.project?.toLowerCase() ?? 'unknown',
    symbol: pool.symbol ?? 'unknown',
    tvl_usd: pool.tvlUsd ?? null,
    apy: pool.apy ?? 0,
    apy_base: pool.apyBase ?? null,
    apy_reward: pool.apyReward ?? null,
    volume_usd_1d: pool.volumeUsd1d ?? null,
    exposure: mapExposure(pool.exposure),
    reward_tokens: cleanRewardTokens(pool.rewardTokens),
    pool_meta: pool.poolMeta
      ? { poolMeta: pool.poolMeta, url: pool.url }
      : null,
    source: 'defillama',
    raw_data: {
      defillama_pool_id: pool.pool,
      original_pool: pool,
      underlying_tokens: pool.underlyingTokens,
      outlier: pool.outlier,
      count: pool.count,
      mu: pool.mu,
      sigma: pool.sigma,
      stablecoin: pool.stablecoin,
      il_risk: pool.ilRisk,
    },
  };
}

function loadFixtureData(): FixtureResponse {
  const fixturePath = join(process.cwd(), 'yield-llama-fixtures.json');
  const fixtureContent = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(fixtureContent) as FixtureResponse;
}

async function transformSamplePools(
  transformer: PoolDataTransformer,
  samplePools: FixturePool[],
): Promise<{ transformedPools: unknown[]; transformErrors: number }> {
  const transformedPools: unknown[] = [];
  let transformErrors = 0;

  for (const pool of samplePools) {
    try {
      const poolData = createFixturePoolData(pool);
      const transformed = transformer.transform(poolData);
      if (transformed) {
        transformedPools.push(transformed);
      } else {
        transformErrors += 1;
        logger.warn('Failed to transform pool', {
          poolId: pool.pool,
          chain: pool.chain,
          project: pool.project,
          symbol: pool.symbol,
        });
      }
    } catch (error) {
      transformErrors += 1;
      logger.error('Error transforming pool', {
        poolId: pool.pool,
        error: toErrorMessage(error),
      });
    }
  }

  return { transformedPools, transformErrors };
}

function logTransformationResults(
  sampleSize: number,
  transformedCount: number,
  transformErrors: number,
): void {
  logger.info('Transformation test results', {
    totalPools: sampleSize,
    successfulTransforms: transformedCount,
    transformErrors,
    successRate: `${((transformedCount / sampleSize) * 100).toFixed(2)}%`,
  });
}

async function testDatabaseInsertion(
  writer: PoolWriter,
  transformedPools: unknown[],
): Promise<void> {
  const testBatchSize = Math.min(100, transformedPools.length);
  const testBatch = transformedPools.slice(0, testBatchSize);

  logger.info(`Testing database insertion with ${testBatchSize} records`);

  try {
    const writeResult = await writer.writePoolSnapshots(testBatch);

    logger.info('Database insertion test results', {
      success: writeResult.success,
      recordsInserted: writeResult.recordsInserted,
      errors: writeResult.errors,
    });

    if (!writeResult.success) {
      logger.error('Database insertion failed', { errors: writeResult.errors });
      process.exit(1);
    }
  } catch (error) {
    logger.error('Database insertion test failed', {
      error: toErrorMessage(error),
    });
    process.exit(1);
  }
}

async function testFixtureData(): Promise<void> {
  logger.info('Starting fixture data test');

  try {
    const fixtureData = loadFixtureData();

    logger.info('Loaded fixture data', {
      status: fixtureData.status,
      totalPools: fixtureData.data.length,
    });

    // Initialize components
    const transformer = new PoolDataTransformer();
    const writer = new PoolWriter();

    // Test transformation with a sample of pools
    const sampleSize = Math.min(100, fixtureData.data.length);
    const samplePools = fixtureData.data.slice(0, sampleSize);

    logger.info(`Testing transformation with ${sampleSize} pools`);

    const { transformedPools, transformErrors } = await transformSamplePools(
      transformer,
      samplePools,
    );
    logTransformationResults(
      sampleSize,
      transformedPools.length,
      transformErrors,
    );

    if (transformedPools.length === 0) {
      logger.error('No pools were successfully transformed!');
      process.exit(1);
    }

    await testDatabaseInsertion(writer, transformedPools);

    logger.info('✅ All tests passed successfully!');

    // Log some sample transformed data for inspection
    logger.info('Sample transformed record:', {
      sample: JSON.stringify(transformedPools[0], null, 2),
    });
  } catch (error) {
    logger.error('Test failed with error:', {
      error: toErrorMessage(error),
    });
    process.exit(1);
  }
}

function mapExposure(exposure?: string): string | null {
  if (!exposure) {
    return null;
  }

  const normalized = exposure.toLowerCase();
  switch (normalized) {
    case 'single':
    case 'multi':
    case 'stable':
      return normalized;
    default:
      return 'multi';
  }
}

function cleanRewardTokens(tokens?: string[]): string[] | null {
  if (!tokens || !Array.isArray(tokens)) {
    return null;
  }

  // Filter out null, undefined, and empty strings
  const cleanTokens = tokens.filter(
    (token): token is string =>
      typeof token === 'string' && token.trim().length > 0,
  );

  if (cleanTokens.length === 0) {
    return null;
  }

  return cleanTokens;
}

// Run the test
testFixtureData().catch((error) => {
  logger.error('Unhandled error in test script:', error);
  process.exit(1);
});
