import { BaseDatabaseClient } from "./baseDatabaseClient.js";
import { logger } from "../../utils/logger.js";
import { toErrorMessage } from "../../utils/errors.js";
import type { BaseBatchResult } from "../../types/index.js";

/**
 * Shared result structure for all database write operations
 */
export interface WriteResult extends BaseBatchResult {
  duplicatesSkipped?: number;
}

export function createEmptyWriteResult(): WriteResult {
  return {
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  };
}

/**
 * Abstract base writer with shared batch processing logic
 * Eliminates duplication across PoolWriter, WalletBalanceWriter, SentimentWriter, etc.
 */
export abstract class BaseWriter<T> extends BaseDatabaseClient {
  protected batchSize = 500;

  protected mergeBatchResult(
    target: WriteResult,
    batchResult: WriteResult,
  ): void {
    target.recordsInserted += batchResult.recordsInserted;

    if (batchResult.duplicatesSkipped) {
      target.duplicatesSkipped =
        (target.duplicatesSkipped || 0) + batchResult.duplicatesSkipped;
    }

    target.errors.push(...batchResult.errors);

    if (!batchResult.success) {
      target.success = false;
    }
  }

  /**
   * Process records in batches with shared logging and error handling
   *
   * @param records - All records to process
   * @param writeBatch - Function to write a single batch
   * @param logContext - Context string for logging (e.g., 'pool snapshots', 'wallet balances')
   * @returns Combined write result from all batches
   */
  protected async processBatches(
    records: T[],
    writeBatch: (batch: T[], batchNumber: number) => Promise<WriteResult>,
    logContext: string,
  ): Promise<WriteResult> {
    if (records.length === 0) {
      return createEmptyWriteResult();
    }

    logger.info(`Starting ${logContext} write`, {
      totalRecords: records.length,
      batchSize: this.batchSize,
    });

    const result = createEmptyWriteResult();

    try {
      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const batchResult = await writeBatch(batch, batchNumber);

        this.mergeBatchResult(result, batchResult);
      }

      logger.info(`${logContext} write completed`, {
        totalRecords: records.length,
        recordsInserted: result.recordsInserted,
        duplicatesSkipped: result.duplicatesSkipped || 0,
        errors: result.errors.length,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error(`${logContext} write failed:`, error);

      result.success = false;
      result.errors.push(toErrorMessage(error));
      return result;
    }
  }

  protected addInsertMetrics(
    result: WriteResult,
    batchSize: number,
    affectedRows: number,
  ): void {
    result.recordsInserted += affectedRows;
    result.duplicatesSkipped =
      (result.duplicatesSkipped || 0) + Math.max(0, batchSize - affectedRows);
  }

  /**
   * Template method for batch writes — handles try/catch, logging, and metric tracking.
   * Subclasses provide only the query construction via `buildQuery`.
   */
  protected async executeBatchWrite(config: {
    batchNumber: number;
    logContext: string;
    buildQuery: () => { query: string; values: unknown[] };
    recordCount: number;
  }): Promise<WriteResult> {
    const result = createEmptyWriteResult();

    try {
      logger.debug(`Processing ${config.logContext} batch`, {
        batchNumber: config.batchNumber,
        batchSize: config.recordCount,
      });

      const { query, values } = config.buildQuery();
      const queryResult = await this.withDatabaseClient((client) =>
        client.query(query, values),
      );

      const affected = queryResult.rowCount ?? 0;
      this.addInsertMetrics(result, config.recordCount, affected);

      logger.debug(`${config.logContext} batch written`, {
        batchNumber: config.batchNumber,
        recordsInserted: affected,
      });
    } catch (error) {
      const message = toErrorMessage(error);
      logger.error(`${config.logContext} batch write failed`, {
        batchNumber: config.batchNumber,
        error: message,
      });
      result.success = false;
      result.errors.push(message);
    }

    return result;
  }
}
