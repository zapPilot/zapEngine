import type { QueryResultRow } from 'pg';

import type { BaseBatchResult } from '../../types/index.js';
import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { BaseDatabaseClient } from './baseDatabaseClient.js';

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
 * Eliminates duplication across WalletBalanceWriter, SentimentWriter, etc.
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
        (target.duplicatesSkipped ?? 0) + batchResult.duplicatesSkipped;
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
   * @param logContext - Context string for logging (e.g., 'wallet balances')
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
        duplicatesSkipped: result.duplicatesSkipped ?? 0,
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
      (result.duplicatesSkipped ?? 0) + Math.max(0, batchSize - affectedRows);
  }

  protected assertWriteSuccess(
    result: WriteResult,
    fallbackMessage: string,
  ): void {
    if (!result.success) {
      throw new Error(result.errors[0] ?? fallbackMessage);
    }
  }

  protected logWriteFailureAndRethrow(
    message: string,
    context: Record<string, unknown>,
    error: unknown,
  ): never {
    logger.error(message, {
      error: toErrorMessage(error),
      ...context,
    });
    throw error;
  }

  protected async writeValidatedBatch<TRecord>(
    batch: TRecord[],
    batchNumber: number,
    filterValidRecords: (batch: TRecord[], result: WriteResult) => TRecord[],
    config: {
      logContext: string;
      onEmpty?: () => void;
      buildQuery: (validRecords: TRecord[]) => {
        query: string;
        values: unknown[];
      };
    },
  ): Promise<WriteResult> {
    const result = createEmptyWriteResult();
    const validRecords = filterValidRecords(batch, result);

    if (validRecords.length === 0) {
      config.onEmpty?.();
      return result;
    }

    const batchResult = await this.executeBatchWrite({
      batchNumber,
      logContext: config.logContext,
      recordCount: validRecords.length,
      buildQuery: () => config.buildQuery(validRecords),
    });

    this.mergeBatchResult(result, batchResult);
    return result;
  }

  protected async executeStandardBatchInsert(
    query: string,
    values: unknown[],
    totalRecords: number,
    context: Record<string, unknown>,
  ): Promise<number> {
    try {
      const queryResult = await this.withDatabaseClient((client) =>
        client.query(query, values),
      );
      const countedResult = queryResult as {
        rowCount?: number | null;
        rows?: unknown[];
      };
      const inserted =
        countedResult.rowCount ?? countedResult.rows?.length ?? 0;
      const successRate = `${((inserted / totalRecords) * 100).toFixed(1)}%`;
      logger.info('Batch insert completed', {
        total: totalRecords,
        ...context,
        inserted,
        failed: totalRecords - inserted,
        successRate,
      });
      return inserted;
    } catch (error) {
      this.throwConfiguredError(
        'Batch insert failed',
        { ...context, total: totalRecords },
        error,
      );
    }
  }

  protected async queryCountOrZero(config: {
    query: string;
    values: unknown[];
    failureMessage: string;
    failureContext: Record<string, unknown>;
  }): Promise<number> {
    try {
      const result = await this.withDatabaseClient((client) =>
        client.query<{ count: string }>(config.query, config.values),
      );
      return Number.parseInt(result.rows[0]?.count ?? '0', 10);
    } catch (error) {
      this.logConfiguredError(
        config.failureMessage,
        config.failureContext,
        error,
      );
      return 0;
    }
  }

  protected async queryOptionalRow<Row extends QueryResultRow>(config: {
    query: string;
    values: unknown[];
    failureMessage: string;
    failureContext: Record<string, unknown>;
  }): Promise<Row | null> {
    try {
      const result = await this.withDatabaseClient((client) =>
        client.query<Row>(config.query, config.values),
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.throwConfiguredError(
        config.failureMessage,
        config.failureContext,
        error,
      );
    }
  }

  protected async queryEntitySnapshotDatesForDates(
    tableName: string,
    entityColumn: string,
    entityValue: string,
    source: string,
    startDate: Date,
    endDate: Date,
    context: Record<string, unknown>,
  ): Promise<string[]> {
    const formattedStartDate = formatDateToYYYYMMDD(startDate);
    const formattedEndDate = formatDateToYYYYMMDD(endDate);
    const query = `
      SELECT to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date
      FROM ${tableName}
      WHERE source = $1
        AND ${entityColumn} = $2
        AND snapshot_date >= $3
        AND snapshot_date <= $4
      ORDER BY snapshot_date ASC
    `;

    try {
      const result = await this.withDatabaseClient((client) =>
        client.query(query, [
          source,
          entityValue,
          formattedStartDate,
          formattedEndDate,
        ]),
      );
      const dates = result.rows.map(
        (row: { snapshot_date: string }) => row.snapshot_date,
      );
      logger.info('Retrieved existing snapshots in range', {
        ...context,
        source,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        count: dates.length,
      });
      return dates;
    } catch (error) {
      this.logConfiguredError(
        'Failed to get existing dates in range',
        { ...context, source },
        error,
      );
      return [];
    }
  }

  protected logSnapshotSaved(
    entityType: string,
    data: {
      priceUsd: number;
      source: string;
      date: string;
      entityIdentifier: Record<string, unknown>;
    },
  ): void {
    logger.info(`${entityType} snapshot saved`, {
      price: data.priceUsd,
      source: data.source,
      date: data.date,
      ...data.entityIdentifier,
    });
  }

  private logConfiguredError(
    message: string,
    context: Record<string, unknown>,
    error: unknown,
  ): void {
    logger.error(message, {
      ...context,
      error: toErrorMessage(error),
    });
  }

  private throwConfiguredError(
    message: string,
    context: Record<string, unknown>,
    error: unknown,
  ): never {
    this.logConfiguredError(message, context, error);
    throw error;
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
