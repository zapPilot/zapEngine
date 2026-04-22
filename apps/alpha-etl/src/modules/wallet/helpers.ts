import type {
  PortfolioItemSnapshotInsert,
  WalletBalanceSnapshotInsert,
} from '../../types/database.js';
import { logger } from '../../utils/logger.js';
import type { WalletBalanceTransformer } from './balanceTransformer.js';
import type { WalletBalanceWriter } from './balanceWriter.js';
import type { PortfolioItemWriter } from './portfolioWriter.js';

/**
 * Merged record type for wallet and portfolio data in ETL pipeline
 */
export type WalletETLRecord =
  | { kind: 'wallet'; data: WalletBalanceSnapshotInsert }
  | { kind: 'portfolio'; data: PortfolioItemSnapshotInsert };

interface SplitWalletETLRecordsResult {
  walletRecords: WalletBalanceSnapshotInsert[];
  portfolioRecords: PortfolioItemSnapshotInsert[];
}

interface WalletLoadResult {
  success: boolean;
  recordsInserted: number;
  duplicatesSkipped: number;
  errors: string[];
}

function createWalletLoadResult(
  balanceResult: {
    success: boolean;
    recordsInserted: number;
    duplicatesSkipped?: number;
    errors: string[];
  },
  portfolioResult: {
    success: boolean;
    recordsInserted: number;
    duplicatesSkipped?: number;
    errors: string[];
  },
): WalletLoadResult {
  const recordsInserted =
    balanceResult.recordsInserted + portfolioResult.recordsInserted;
  const errors = [...balanceResult.errors, ...portfolioResult.errors];
  const success = balanceResult.success && portfolioResult.success;
  const duplicatesSkipped =
    (balanceResult.duplicatesSkipped ?? 0) +
    (portfolioResult.duplicatesSkipped ?? 0);

  return {
    success,
    recordsInserted,
    duplicatesSkipped,
    errors,
  };
}

function splitWalletETLRecords(
  records: WalletETLRecord[],
): SplitWalletETLRecordsResult {
  const walletRecords: WalletBalanceSnapshotInsert[] = [];
  const portfolioRecords: PortfolioItemSnapshotInsert[] = [];

  for (const record of records) {
    if (record.kind === 'wallet') {
      walletRecords.push(record.data);
      continue;
    }
    portfolioRecords.push(record.data);
  }

  return { walletRecords, portfolioRecords };
}

function mergeWalletETLRecords(
  walletRecords: WalletBalanceSnapshotInsert[],
  portfolioRecords: PortfolioItemSnapshotInsert[],
): WalletETLRecord[] {
  return [
    ...walletRecords.map((data) => ({ kind: 'wallet' as const, data })),
    ...portfolioRecords.map((data) => ({ kind: 'portfolio' as const, data })),
  ];
}

/**
 * Creates a transform callback for wallet ETL pipelines.
 * Filters wallet records from merged data, transforms them, and re-merges with portfolio records.
 */
export function createWalletTransformCallback(
  transformer: WalletBalanceTransformer,
  jobId: string,
  logPrefix: string,
): (rawData: WalletETLRecord[]) => Promise<WalletETLRecord[]> {
  return async (rawData: WalletETLRecord[]) => {
    const { walletRecords, portfolioRecords } = splitWalletETLRecords(rawData);

    logger.info(`${logPrefix} - Transforming wallet balance data`, {
      jobId,
      recordCount: walletRecords.length,
    });

    const transformedBalances = transformer.transformBatch(walletRecords);

    if (transformedBalances.length === 0) {
      logger.warn('No valid data after wallet balance transformation', {
        jobId,
      });
    } else {
      logger.info(`${logPrefix} - Transformation completed`, {
        jobId,
        originalCount: walletRecords.length,
        transformedCount: transformedBalances.length,
      });
    }

    return mergeWalletETLRecords(transformedBalances, portfolioRecords);
  };
}

/**
 * Creates a load callback for wallet ETL pipelines.
 * Filters wallet and portfolio records, writes both, and merges results.
 */
export function createWalletLoadCallback(
  writer: WalletBalanceWriter,
  portfolioWriter: PortfolioItemWriter,
  jobId: string,
  logPrefix: string,
): (transformedData: WalletETLRecord[]) => Promise<WalletLoadResult> {
  return async (transformedData: WalletETLRecord[]) => {
    const { walletRecords: walletData, portfolioRecords: portfolioData } =
      splitWalletETLRecords(transformedData);

    logger.info(`${logPrefix} - Writing data to database`, {
      jobId,
      walletRecords: walletData.length,
      portfolioRecords: portfolioData.length,
    });

    const portfolioResult = await portfolioWriter.writeSnapshots(portfolioData);
    const balanceResult = await writer.writeWalletBalanceSnapshots(walletData);
    const loadResult = createWalletLoadResult(balanceResult, portfolioResult);

    logger.info(`${logPrefix} - Database write completed`, {
      jobId,
      recordsInserted: loadResult.recordsInserted,
      errors: loadResult.errors.length,
      success: loadResult.success,
    });

    return loadResult;
  };
}

/**
 * Creates merged fetch result from wallet balances and portfolio items
 */
export function createMergedFetchResult(
  walletBalances: WalletBalanceSnapshotInsert[],
  portfolioItems: PortfolioItemSnapshotInsert[],
): WalletETLRecord[] {
  return mergeWalletETLRecords(walletBalances, portfolioItems);
}
