import type { PoolClient } from 'pg';

import {
  BaseWriter,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { logger } from '../../utils/logger.js';

interface InsertValues {
  columns: readonly string[];
  placeholders: string;
  values: unknown[];
}

interface ReplaceDailySlicesOptions<T> {
  table: string;
  deletePredicate: string;
  deleteValues: unknown[];
  records: T[];
  batchSize: number;
  buildInsertValues: (records: T[]) => InsertValues;
}

export async function replaceDailySlices<T>(
  client: PoolClient,
  options: ReplaceDailySlicesOptions<T>,
): Promise<number> {
  await client.query('BEGIN');
  await client.query(
    `DELETE FROM ${options.table} WHERE ${options.deletePredicate}`,
    options.deleteValues,
  );

  let inserted = 0;
  for (
    let index = 0;
    index < options.records.length;
    index += options.batchSize
  ) {
    const batch = options.records.slice(index, index + options.batchSize);
    const { columns, placeholders, values } = options.buildInsertValues(batch);
    const batchResult = await client.query(
      `INSERT INTO ${options.table} (${columns.join(', ')}) VALUES ${placeholders}`,
      values,
    );
    inserted += batchResult.rowCount ?? 0;
  }

  await client.query('COMMIT');
  return inserted;
}

interface ExecuteDailyReplacementOptions {
  result: WriteResult;
  replace: (client: PoolClient) => Promise<number>;
  logMessage: string;
  walletDays: number;
}

export abstract class DailySliceWriter<T> extends BaseWriter<T> {
  protected async executeDailyReplacement(
    options: ExecuteDailyReplacementOptions,
  ): Promise<WriteResult> {
    if (options.walletDays === 0) {
      return options.result;
    }

    try {
      options.result.recordsInserted = await this.withDatabaseClient(
        options.replace,
      );
      logger.info(options.logMessage, {
        records: options.result.recordsInserted,
        walletDays: options.walletDays,
      });
    } catch (error) {
      options.result.success = false;
      options.result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
    }

    return options.result;
  }
}
