import { z } from 'zod';

import { transformBatchWithLogging } from '../../core/transformers/baseTransformer.js';
import type { PoolAprSnapshotInsert } from '../../types/database.js';
import type { PoolData } from '../../types/index.js';
import {
  convertDailyCompoundedApyToApr,
  normalizePercentage,
  validateApr,
  validateApy,
} from '../../utils/aprUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  cleanRewardTokens,
  parseSymbolsArray,
} from '../../utils/symbolUtils.js';

const poolDataSchema = z.object({
  pool_address: z.string().nullable().optional(), // Nullable for sources like DeFiLlama
  protocol_address: z.string().nullable().optional(), // Nullable for sources like DeFiLlama
  chain: z.string().min(1, 'Chain is required'),
  protocol: z.string().min(1, 'Protocol is required'),
  symbol: z.string().min(1, 'Symbol is required'),
  symbols: z.array(z.string()).nullable().optional(), // Array of individual token symbols
  underlying_tokens: z.array(z.string()).nullable().optional(), // Added to match DeFiLlama fetcher output
  tvl_usd: z.number().positive().nullable().optional(),
  apy: z.number().min(0),
  apy_base: z.number().min(0).nullable().optional(),
  apy_reward: z.number().min(0).nullable().optional(),
  volume_usd_1d: z.number().positive().nullable().optional(),
  exposure: z.enum(['single', 'multi', 'stable']).nullable().optional(),
  reward_tokens: z.array(z.string().nullable()).nullable().optional(),
  pool_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  source: z.string().min(1, 'Source is required'),
  raw_data: z.record(z.string(), z.unknown()).nullable().optional(),
});

type ValidatedPoolData = z.infer<typeof poolDataSchema>;

/**
 * Converts raw pool API payloads into normalized APR snapshot inserts.
 */
export class PoolDataTransformer {
  transform(
    rawData: PoolData | null | undefined,
  ): PoolAprSnapshotInsert | null {
    try {
      const validated = poolDataSchema.parse(rawData);

      // Convert APR first and check if it's valid
      const apr = this.normalizeAndConvertToApr(
        validated.apy,
        validated.source,
      );
      if (apr === null) {
        logger.warn('Failed to convert APY to valid APR, rejecting record', {
          apy: validated.apy,
          source: validated.source,
        });
        return null;
      }

      const transformed = this.buildPoolSnapshot(validated, apr);

      /* v8 ignore start -- defense-in-depth: Zod validation guarantees transformed record passes isValidRecord checks */
      if (!this.isValidRecord(transformed)) {
        logger.warn('Record failed validation after transformation', {
          pool_address: transformed.pool_address,
          protocol_address: transformed.protocol_address,
        });
        return null;
      }
      /* v8 ignore stop */

      return transformed;
    } catch (error) {
      const rawRecord: Record<string, unknown> =
        rawData && typeof rawData === 'object' && !Array.isArray(rawData)
          ? (rawData as unknown as Record<string, unknown>)
          : {};

      logger.error('Failed to transform pool data:', {
        error: toErrorMessage(error),
        pool_address: rawRecord['pool_address'] ?? null,
        protocol_address: rawRecord['protocol_address'] ?? null,
      });
      return null;
    }
  }

  transformBatch(
    rawDataList: PoolData[],
    source: string,
  ): PoolAprSnapshotInsert[] {
    if (source === 'debank') {
      // For debank data, return the raw data as-is since it should be handled by WalletBalanceTransformer
      logger.warn(
        'PoolDataTransformer received debank data - this should be handled by WalletBalanceTransformer',
        {
          source,
          recordCount: rawDataList.length,
        },
      );
      // Return empty array to prevent incorrect processing
      return [];
    }

    return transformBatchWithLogging(
      rawDataList,
      (item) => this.transform(item),
      'Pool data',
    );
  }

  private normalizeAndConvertToApr(
    apy?: number | null,
    source?: string,
  ): number | null {
    if (apy === undefined || apy === null) {
      return null;
    }

    const normalizedApy = normalizePercentage(apy, apy <= 1);
    /* v8 ignore start -- defense-in-depth: Zod v4 z.number().min(0) rejects NaN/Infinity; normalizePercentage preserves finiteness */
    if (!validateApy(normalizedApy)) {
      logger.warn('Invalid APY value detected', { apy, normalizedApy, source });
      return null;
    }
    /* v8 ignore stop */

    // Convert APY to APR based on source type
    const apr = this.convertApyToApr(normalizedApy, source);
    if (!validateApr(apr)) {
      logger.warn('Invalid APR value after conversion', {
        apy: normalizedApy,
        apr,
        source,
      });
      return null;
    }

    return apr;
  }

  private convertApyToApr(apy: number, source?: string): number {
    const isDeFiLlama = source?.toLowerCase() === 'defillama';

    if (isDeFiLlama) {
      // DeFiLlama uses daily-compounded APY
      return convertDailyCompoundedApyToApr(apy);
    }

    // Other sources - assume APR-like values
    return apy;
  }

  private buildPoolSnapshot(
    validated: ValidatedPoolData,
    apr: number,
  ): PoolAprSnapshotInsert {
    const normalizedSymbol = validated.symbol.toLowerCase();
    return {
      pool_address: this.toNullableField(validated.pool_address),
      protocol_address: this.toNullableField(validated.protocol_address),
      chain: validated.chain.toLowerCase(),
      protocol: validated.protocol.toLowerCase(),
      symbol: normalizedSymbol,
      symbols: parseSymbolsArray(normalizedSymbol, validated.underlying_tokens),
      underlying_tokens: this.toNullableField(validated.underlying_tokens),
      tvl_usd: this.toNullableField(validated.tvl_usd),
      apr,
      apr_base: this.normalizeAndConvertToApr(
        validated.apy_base,
        validated.source,
      ),
      apr_reward: this.normalizeAndConvertToApr(
        validated.apy_reward,
        validated.source,
      ),
      volume_usd_1d: this.toNullableField(validated.volume_usd_1d),
      exposure: this.toNullableField(validated.exposure),
      reward_tokens: cleanRewardTokens(validated.reward_tokens),
      pool_meta: this.toNullableField(validated.pool_meta),
      source: validated.source.toLowerCase(),
      raw_data: this.toNullableField(validated.raw_data),
      snapshot_time: new Date().toISOString(),
    };
  }

  private toNullableField<T>(value: T | null | undefined): T | null {
    return value ?? null;
  }

  /* v8 ignore start -- defense-in-depth: all branches guarded by upstream Zod validation */
  private isValidRecord(record: PoolAprSnapshotInsert): boolean {
    if (!record.source || !record.symbol) {
      return false;
    }
    if (!Number.isFinite(record.apr)) {
      return false;
    }
    if (
      record.tvl_usd !== null &&
      (record.tvl_usd < 0 || !Number.isFinite(record.tvl_usd))
    ) {
      return false;
    }
    if (typeof record.chain !== 'string' || record.chain.length === 0) {
      return false;
    }
    if (typeof record.protocol !== 'string' || record.protocol.length === 0) {
      return false;
    }
    return true;
  }
  /* v8 ignore stop */
}
